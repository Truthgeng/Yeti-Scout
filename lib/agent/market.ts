import type { MarketSignals } from "@/lib/types";

const DAY = 86_400_000;

type DexPair = {
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  txns?: { h24?: { buys?: number; sells?: number } };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { socials?: { type?: string; url?: string }[] };
};

/** Every pool DexScreener knows for this coin on Sui (Cetus, Turbos, Bluefin, Aftermath, ...) */
export async function dexPairs(coinType: string): Promise<DexPair[]> {
  const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/sui/${encodeURIComponent(coinType)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const data = await res.json();
  const list: DexPair[] = Array.isArray(data) ? data : data?.pairs ?? [];
  // Only pools where this coin is one of the two sides (the endpoint can return loose matches)
  const want = coinType.toLowerCase();
  const short = want.replace(/^0x0+/, "0x");
  const same = (a?: string) => !!a && (a.toLowerCase() === want || a.toLowerCase().replace(/^0x0+/, "0x") === short);
  return list.filter((p) => same(p.baseToken?.address) || same(p.quoteToken?.address));
}

/** USD price of a coin from its deepest pool. Used for the LOFI holding threshold. */
export async function priceUsd(coinType: string): Promise<number | undefined> {
  const pairs = await dexPairs(coinType);
  const best = pairs
    .filter((p) => p.baseToken?.address && Number(p.priceUsd) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return best ? Number(best.priceUsd) : undefined;
}

/** Holder count and top-10 share from GeckoTerminal. Optional: a failure here never fails the scan. */
async function holders(coinType: string): Promise<{ count?: number; top10?: number }> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/sui-network/tokens/${encodeURIComponent(coinType)}/info`,
    { headers: { accept: "application/json;version=20230203" }, signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const a = (await res.json())?.data?.attributes?.holders;
  const count = Number(a?.count);
  const top10 = Number(a?.distribution_percentage?.top_10);
  return {
    count: Number.isFinite(count) && count > 0 ? count : undefined,
    top10: Number.isFinite(top10) && top10 > 0 ? top10 / 100 : undefined,
  };
}

/**
 * Total 24h volume across every exchange, from CoinGecko. Only used to show how much
 * trading happens off-chain on centralised exchanges; it never changes the score.
 * Cached for 10 minutes to stay inside CoinGecko's free rate limit. Optional:
 * a failure (or a token CoinGecko doesn't list) just leaves the line off the report.
 */
const cgCache = new Map<string, { at: number; usd: number | null }>();
async function allExchangeVolume(coinType: string): Promise<number | undefined> {
  const hit = cgCache.get(coinType);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.usd ?? undefined;
  const key = process.env.COINGECKO_API_KEY;
  const base = key?.startsWith("CG-") && process.env.COINGECKO_PRO !== "1" ? "https://api.coingecko.com/api/v3" : key ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const res = await fetch(
    `${base}/coins/sui/contract/${encodeURIComponent(coinType)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
    {
      headers: { accept: "application/json", ...(key ? (base.includes("pro-api") ? { "x-cg-pro-api-key": key } : { "x-cg-demo-api-key": key }) : {}) },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (res.status === 404) { cgCache.set(coinType, { at: Date.now(), usd: null }); return undefined; }
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const usd = Number((await res.json())?.market_data?.total_volume?.usd);
  const value = Number.isFinite(usd) && usd > 0 ? usd : null;
  cgCache.set(coinType, { at: Date.now(), usd: value });
  return value ?? undefined;
}

export async function marketSignals(coinType: string): Promise<MarketSignals> {
  const [pairs, hold, allVolume] = await Promise.all([
    dexPairs(coinType),
    holders(coinType).catch((e) => { console.warn("holders lookup failed", String(e)); return {} as { count?: number; top10?: number }; }),
    allExchangeVolume(coinType).catch((e) => { console.warn("coingecko lookup failed", String(e)); return undefined; }),
  ]);

  const sum = (f: (p: DexPair) => number | undefined) => pairs.reduce((a, p) => a + (f(p) ?? 0), 0);
  const byDepth = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const main = byDepth[0];
  const asBase = pairs.find((p) => p.baseToken?.address && p.priceUsd);
  const created = pairs.map((p) => p.pairCreatedAt).filter((t): t is number => typeof t === "number" && t > 0);
  const oldest = created.length ? Math.min(...created) : undefined;
  const twitter = pairs
    .flatMap((p) => p.info?.socials ?? [])
    .find((s) => /twitter|^x$/i.test(s.type ?? "") || /(?:x|twitter)\.com\//i.test(s.url ?? ""));
  const listedHandle = twitter?.url?.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i)?.[1];

  return {
    symbol: asBase?.baseToken?.symbol,
    name: asBase?.baseToken?.name,
    priceUsd: asBase?.priceUsd ? Number(asBase.priceUsd) : undefined,
    marketCapUsd: asBase?.marketCap ?? asBase?.fdv,
    fdvUsd: asBase?.fdv ?? asBase?.marketCap,
    liquidityUsd: sum((p) => p.liquidity?.usd),
    volume24hUsd: sum((p) => p.volume?.h24),
    buys24h: sum((p) => p.txns?.h24?.buys),
    sells24h: sum((p) => p.txns?.h24?.sells),
    pools: pairs.length,
    mainPool: main?.pairAddress
      ? { id: main.pairAddress, dex: main.dexId ?? "dex", liquidityUsd: main.liquidity?.usd ?? 0, createdAt: main.pairCreatedAt }
      : undefined,
    // Only plain Sui object ids: some DEXes list pools under longer composite ids Sui's API can't read
    topPools: byDepth.filter((p) => p.pairAddress && /^0x[0-9a-fA-F]{1,64}$/.test(p.pairAddress) && (p.liquidity?.usd ?? 0) > 500).slice(0, 3).map((p) => p.pairAddress!),
    ageDays: oldest ? Math.floor((Date.now() - oldest) / DAY) : undefined,
    holders: hold.count,
    ...(allVolume !== undefined
      ? { totalVolume24hUsd: allVolume, cexVolume24hUsd: Math.max(0, allVolume - sum((p) => p.volume?.h24)) }
      : {}),
    top10HolderShare: hold.top10,
    listedHandle,
  };
}
