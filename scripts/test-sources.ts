/**
 * Checks every data source Yeti Scout reads, using LOFI itself.
 * Run on your own computer:  npm run test:sources
 * Nothing is paid and no wallet is needed.
 */
import { marketSignals } from "../lib/agent/market";
import { swapSignals } from "../lib/agent/swaps";
import { coinBalance, LOFI_COIN_TYPE, SUI_GRAPHQL_URL } from "../lib/sui";

const coin = process.argv[2] || LOFI_COIN_TYPE;
const ok = (s: string) => console.log(`  \x1b[32mOK\x1b[0m   ${s}`);
const bad = (s: string, e: unknown) => console.log(`  \x1b[31mFAIL\x1b[0m ${s}: ${e instanceof Error ? e.message : e}`);

console.log(`\nTesting data sources for ${coin}\n`);

let pools: string[] = [];
try {
  const m = await marketSignals(coin);
  ok(`DexScreener: ${m.pools} pools, $${Math.round(m.liquidityUsd)} liquidity, $${Math.round(m.volume24hUsd)} 24h volume, price $${m.priceUsd}`);
  ok(`DexScreener: main pool ${m.mainPool?.id ?? "none"} on ${m.mainPool?.dex ?? "?"}, listed X handle: ${m.listedHandle ?? "none"}`);
  if (m.holders !== undefined) ok(`GeckoTerminal holders: ${m.holders}, top 10 hold ${Math.round((m.top10HolderShare ?? 0) * 100)}%`);
  else console.log("  \x1b[33mWARN\x1b[0m GeckoTerminal gave no holder data (scans still work, just without holder stats)");
  pools = m.topPools;
} catch (e) { bad("DexScreener / GeckoTerminal", e); }

if (pools.length) {
  try {
    const s = await swapSignals(coin, pools);
    ok(`Sui GraphQL (${SUI_GRAPHQL_URL}): ${s.pools} pools, ${s.swaps} swaps by ${s.traders} wallets over ${s.hoursCovered}h, ${s.roundTrippers} bought and sold, ${s.repeatSizeWallets} bot wallets (${Math.round(s.repeatSizeShare * 100)}% of swaps), ${s.washWallets} wash bots (${Math.round(s.washShare * 100)}%), top 10 wallets ${Math.round(s.topTraderShare * 100)}%`);
    if (s.swaps === 0) console.log("  \x1b[33mWARN\x1b[0m 0 swaps found. Send me this output so I can check the pool query.");
    const { ruleVerdict } = await import("../lib/agent/verdict");
    const m2 = await marketSignals(coin);
    const v = ruleVerdict(null, { market: m2, swaps: s });
    ok(`Onchain-only score: ${v.score}/100, ${v.label}. Flags: ${v.flags.join("; ") || "none"}`);
  } catch (e) { bad("Sui GraphQL swaps", e); }
}

try {
  // LOFI's main pool object holds LOFI, but this just checks the balance query runs
  const b = await coinBalance("0x0000000000000000000000000000000000000000000000000000000000000000", LOFI_COIN_TYPE);
  ok(`Sui GraphQL balance query works (zero address holds ${b} base units)`);
} catch (e) { bad("Sui GraphQL balance", e); }

console.log("\nDone. Paste this whole output back to Claude.\n");
