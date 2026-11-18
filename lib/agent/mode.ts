/**
 * Three modes:
 *   demo  MOCK=1 (default)          sample data, nothing paid, open to everyone
 *   test  MOCK=0 + SANDBOX=1        real Sui + X data (X paid with free test USDC on Celo Sepolia), open to everyone
 *   live  MOCK=0 + SANDBOX=0        everything real; scans gated on holding LOFI after the free ones
 */
export type Mode = "demo" | "test" | "live";

export function mode(): Mode {
  if (process.env.MOCK !== "0") return "demo";
  return process.env.SANDBOX === "1" ? "test" : "live";
}

export const isMock = () => mode() === "demo";
export const isSandbox = () => mode() === "test";
