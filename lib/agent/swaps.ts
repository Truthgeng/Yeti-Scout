import { gql, normaliseCoinType } from "@/lib/sui";
import type { SwapSignals } from "@/lib/types";

/**
 * Reads the most recent transactions that touched the token's main pool, straight
 * from Sui, and works out who is actually trading it.
 *
 * Each transaction's balance changes show how much of the token the sender gained
 * (a buy) or lost (a sell), so aggregator routes count the real trader, not the router.
 */
const PAGE = 50;
const PAGES = Number(process.env.SWAP_PAGES || "2"); // per pool: up to 100 recent transactions

const QUERY = `query($pool: SuiAddress!, $before: String) {
  transactions(last: ${PAGE}, before: $before, filter: { affectedObject: $pool }) {
    pageInfo { hasPreviousPage startCursor }
    nodes {
      digest
      sender { address }
      effects {
        timestamp
        status
        balanceChanges(first: 50) { nodes { owner { address } amount coinType { repr } } }
      }
    }
  }
}`;

type Node = {
  digest: string;
  sender?: { address: string } | null;
  effects?: {
    timestamp?: string | null;
    status?: string | null;
    balanceChanges?: { nodes: { owner?: { address: string } | null; amount: string; coinType?: { repr: string } | null }[] } | null;
  } | null;
};

type Swap = { trader: string; digest?: string; side: "buy" | "sell"; amount: bigint; at: number };

/**
 * Reads the deepest pools (up to 3) side by side. One pool alone can be mostly
 * arbitrage bots keeping prices in line with the others, which says little about
 * who is really buying the token.
 */
export async function swapSignals(coinType: string, pools: string[]): Promise<SwapSignals> {
  const lists = await Promise.all(pools.map((p) => poolSwaps(coinType, p)));
  return summarise(pools.join(","), lists.flat(), "sui-graphql", pools.length);
}

async function poolSwaps(coinType: string, pool: string): Promise<Swap[]> {
  const want = normaliseCoinType(coinType);
  const swaps: Swap[] = [];
  let before: string | null = null;

  for (let i = 0; i < PAGES; i++) {
    const data: any = await gql(QUERY, { pool, before });
    const conn = data?.transactions;
    for (const n of (conn?.nodes ?? []) as Node[]) {
      if (n.effects?.status && n.effects.status !== "SUCCESS") continue;
      const trader = n.sender?.address;
      if (!trader) continue;
      // The sender's own change in this token: positive = bought, negative = sold
      const change = (n.effects?.balanceChanges?.nodes ?? []).find(
        (b) => b.owner?.address === trader && b.coinType?.repr && normaliseCoinType(b.coinType.repr) === want,
      );
      if (!change) continue; // liquidity moves, admin calls, or not a swap of this token
      const amount = BigInt(change.amount);
      if (amount === 0n) continue;
      swaps.push({
        trader,
        digest: n.digest,
        side: amount > 0n ? "buy" : "sell",
        amount: amount > 0n ? amount : -amount,
        at: n.effects?.timestamp ? Date.parse(n.effects.timestamp) : NaN,
      });
    }
    if (!conn?.pageInfo?.hasPreviousPage) break;
    before = conn.pageInfo.startCursor;
  }
  return swaps;
}

export function summarise(pool: string, all: Swap[], source: SwapSignals["source"] = "sui-graphql", pools = 1): SwapSignals {
  // A route through two of the pools shows up in both: count each transaction once
  const swaps = [...new Map(all.map((s, i) => [s.digest ?? i, s])).values()];
  const byTrader = new Map<string, Swap[]>();
  for (const s of swaps) byTrader.set(s.trader, [...(byTrader.get(s.trader) ?? []), s]);
  const counts = [...byTrader.values()].map((l) => l.length).sort((a, b) => b - a);
  const top10 = counts.slice(0, 10).reduce((a, b) => a + b, 0);

  let roundTrippers = 0;
  let repeatSizeWallets = 0;
  let repeatSizeSwaps = 0;
  let washWallets = 0;
  let washSwaps = 0;
  for (const list of byTrader.values()) {
    const both = list.some((s) => s.side === "buy") && list.some((s) => s.side === "sell");
    if (both) roundTrippers++;
    // 3+ swaps within 2% of the same size is how scripted volume usually looks
    if (list.length >= 3) {
      const sorted = [...list].sort((a, b) => (a.amount < b.amount ? -1 : 1));
      let run = 1;
      for (let i = 1; i < sorted.length && run < 3; i++) {
        const prev = sorted[i - 1].amount;
        run = prev > 0n && (sorted[i].amount - prev) * 100n <= prev * 2n ? run + 1 : 1;
      }
      if (run >= 3) {
        repeatSizeWallets++; repeatSizeSwaps += list.length;
        if (both) { washWallets++; washSwaps += list.length; }
      }
    }
  }

  const times = swaps.map((s) => s.at).filter(Number.isFinite);
  const hoursCovered = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 3_600_000 : 0;

  return {
    pool,
    swaps: swaps.length,
    hoursCovered: Math.round(hoursCovered * 10) / 10,
    traders: byTrader.size,
    buyers: new Set(swaps.filter((s) => s.side === "buy").map((s) => s.trader)).size,
    sellers: new Set(swaps.filter((s) => s.side === "sell").map((s) => s.trader)).size,
    topTraderShare: swaps.length ? top10 / swaps.length : 0,
    roundTrippers,
    repeatSizeWallets,
    repeatSizeShare: swaps.length ? repeatSizeSwaps / swaps.length : 0,
    washWallets,
    washShare: swaps.length ? washSwaps / swaps.length : 0,
    pools,
    source,
  };
}
