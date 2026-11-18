import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { coinBalance, LOFI_COIN_TYPE, LOFI_DECIMALS, normaliseAddress, SUI_GRAPHQL_URL } from "@/lib/sui";
import { priceUsd } from "@/lib/agent/market";
import { signInMessage } from "@/lib/sign-in";

/**
 * Hold to scan.
 *
 * A visitor signs one message with their Sui wallet to prove they own it. If the
 * wallet holds at least HOLD_USD worth of LOFI, they get HOLDER_DAILY_SCANS scans
 * a day. The balance is checked again on every scan, so LOFI moved out of the
 * wallet stops counting straight away.
 */

export const HOLD_USD = Number(process.env.HOLD_USD || "3");
export const HOLDER_DAILY_SCANS = Number(process.env.HOLDER_DAILY_SCANS || "20");
export const HOLDER_COOKIE = "ys_holder";
const SESSION_HOURS = 24;
const SIGN_IN_WINDOW_MS = 10 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || process.env.AGENT_PRIVATE_KEY || "dev-only-secret";
}
const mac = (body: string) => createHmac("sha256", secret()).update(`holder:${body}`).digest("base64url").slice(0, 32);

// ---------------------------------------------------------------------------
// LOFI price and how much a wallet needs to hold
// ---------------------------------------------------------------------------

let priceCache: { at: number; usd: number } | null = null;
export async function lofiPrice(): Promise<number | undefined> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60_000) return priceCache.usd;
  const p = await priceUsd(LOFI_COIN_TYPE).catch(() => undefined);
  if (p) priceCache = { at: Date.now(), usd: p };
  return p ?? priceCache?.usd;
}

/** LOFI needed to hold HOLD_USD worth, in whole tokens (rounded up) */
export async function lofiNeeded(): Promise<number | undefined> {
  const p = await lofiPrice();
  return p ? Math.ceil(HOLD_USD / p) : undefined;
}

export type Holding = { address: string; lofi: number; needed: number | undefined; holds: boolean };

export async function checkHolding(address: string): Promise<Holding> {
  const [raw, needed] = await Promise.all([coinBalance(address, LOFI_COIN_TYPE), lofiNeeded()]);
  const lofi = Number(raw) / 10 ** LOFI_DECIMALS;
  // No price available: fall back to a fixed amount so the gate never locks everyone out
  const min = needed ?? Number(process.env.HOLD_FALLBACK_LOFI || "750");
  return { address: normaliseAddress(address), lofi, needed: min, holds: lofi >= min };
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export async function verifySignIn(p: { address: string; issuedAt: string; signature: string; host: string }): Promise<string> {
  const issued = Date.parse(p.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > SIGN_IN_WINDOW_MS) {
    throw new Error("That sign-in request expired. Connect again.");
  }
  const message = new TextEncoder().encode(signInMessage(p.address, p.issuedAt, p.host));
  // The client is only used for zkLogin wallets (Slush with Google sign-in and similar)
  const client = new SuiGraphQLClient({ url: SUI_GRAPHQL_URL, network: "mainnet" });
  const key = await verifyPersonalMessageSignature(message, p.signature, { address: normaliseAddress(p.address), client });
  return normaliseAddress(key.toSuiAddress());
}

export function holderCookie(address: string) {
  const exp = Date.now() + SESSION_HOURS * 3_600_000;
  const body = `${normaliseAddress(address)}.${exp}`;
  return `${body}.${mac(body)}`;
}

/** The wallet this visitor signed in with, or null */
export function readHolder(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [addr, exp, sig] = cookie.split(".");
  if (!addr || !exp || !sig) return null;
  const want = mac(`${addr}.${exp}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (Number(exp) < Date.now()) return null;
  return addr;
}

// ---------------------------------------------------------------------------
// Daily allowance per wallet. Kept per server instance, resets each UTC day.
// ---------------------------------------------------------------------------

let day = "";
const used = new Map<string, number>();
function today() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; used.clear(); }
}
export function scansLeft(address: string) {
  today();
  return Math.max(0, HOLDER_DAILY_SCANS - (used.get(address) ?? 0));
}
export function useScan(address: string) {
  today();
  used.set(address, (used.get(address) ?? 0) + 1);
}
