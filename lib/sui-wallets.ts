"use client";

import { getWallets, isWalletWithRequiredFeatureSet, type Wallet, type WalletAccount } from "@mysten/wallet-standard";

/**
 * Sui wallets in the browser (Phantom, Slush, Suiet, OKX, ...), found through the
 * wallet standard. Only wallets that can sign a personal message are listed,
 * because that is all Yeti Scout asks for: no transactions, no approvals.
 */
export type SuiWallet = { name: string; icon: string; wallet: Wallet };

const REQUIRED = ["standard:connect", "sui:signPersonalMessage"] as const;

function list(): SuiWallet[] {
  return getWallets()
    .get()
    .filter((w) => isWalletWithRequiredFeatureSet(w, [...REQUIRED]) && w.chains.some((c) => c.startsWith("sui:")))
    .map((w) => ({ name: w.name, icon: w.icon, wallet: w }));
}

/** Calls back now and whenever a wallet extension registers itself */
export function watchWallets(cb: (w: SuiWallet[]) => void): () => void {
  cb(list());
  const api = getWallets();
  const off1 = api.on("register", () => cb(list()));
  const off2 = api.on("unregister", () => cb(list()));
  return () => { off1(); off2(); };
}

export async function connect(w: SuiWallet): Promise<WalletAccount> {
  const feature = (w.wallet.features as any)["standard:connect"];
  const { accounts } = await feature.connect();
  const acct = (accounts as WalletAccount[]).find((a) => a.chains.some((c) => c.startsWith("sui:"))) ?? accounts[0];
  if (!acct) throw new Error("The wallet didn't share an account.");
  return acct;
}

export async function signMessage(w: SuiWallet, account: WalletAccount, text: string): Promise<string> {
  const feature = (w.wallet.features as any)["sui:signPersonalMessage"];
  const { signature } = await feature.signPersonalMessage({ message: new TextEncoder().encode(text), account });
  return signature;
}

export async function disconnect(w: SuiWallet) {
  const feature = (w.wallet.features as any)["standard:disconnect"];
  try { await feature?.disconnect(); } catch { /* not every wallet supports it */ }
}
