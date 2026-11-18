/**
 * Sui reads go through Sui's GraphQL service (the JSON-RPC API is being retired).
 * Point SUI_GRAPHQL_URL at another provider if the public endpoint rate-limits you.
 */
export const SUI_GRAPHQL_URL = process.env.SUI_GRAPHQL_URL || "https://graphql.mainnet.sui.io/graphql";

export async function gql<T = any>(query: string, variables: Record<string, unknown>, url = SUI_GRAPHQL_URL): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sui GraphQL ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (json.errors?.length) throw new Error(`Sui GraphQL: ${json.errors.map((e: any) => e.message).join("; ").slice(0, 300)}`);
  return json.data as T;
}

/** 0x2::sui::SUI -> 0x000...002::sui::SUI, so coin types compare equal however they were typed */
export function normaliseCoinType(t: string): string {
  const m = t.trim().match(/^(0x)?([0-9a-fA-F]{1,64})::(\w+)::(\w+)$/);
  if (!m) return t.trim();
  return `0x${m[2].toLowerCase().padStart(64, "0")}::${m[3]}::${m[4]}`;
}

export const isCoinType = (t: string) => /^(0x)?[0-9a-fA-F]{1,64}::\w+::\w+$/.test(t.trim());

export { normaliseAddress } from "@/lib/sign-in";
import { normaliseAddress } from "@/lib/sign-in";

/** LOFI, the token Yeti Scout is gated on. Override with LOFI_COIN_TYPE. */
export const LOFI_COIN_TYPE = normaliseCoinType(
  process.env.LOFI_COIN_TYPE || "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI",
);
export const LOFI_DECIMALS = 9;

/** Total balance of one coin type held by an address, in base units */
export async function coinBalance(address: string, coinType: string): Promise<bigint> {
  const data = await gql<{ address: { balance: { totalBalance: string } | null } | null }>(
    `query($a: SuiAddress!, $t: String!) { address(address: $a) { balance(coinType: $t) { totalBalance } } }`,
    { a: normaliseAddress(address), t: coinType },
  );
  return BigInt(data.address?.balance?.totalBalance ?? "0");
}
