/** The exact text the wallet signs. The page builds it and the server rebuilds it to check. */
export const normaliseAddress = (a: string) => `0x${a.trim().replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;

export function signInMessage(address: string, issuedAt: string, host: string) {
  return `Sign in to Yeti Scout\n\nThis proves you own this wallet so we can check your LOFI. It costs nothing and moves no funds.\n\nWallet: ${normaliseAddress(address)}\nSite: ${host}\nIssued: ${issuedAt}`;
}
