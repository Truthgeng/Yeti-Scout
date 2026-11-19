import { socialSignals } from "./social";
import { summarise } from "./swaps";
import { ruleScore } from "./verdict";
import type { CheckInput, MarketSignals, PaidCall, Post, Report, SwapSignals } from "@/lib/types";

/**
 * Mock mode: fake posts and transfers pushed through the REAL scoring code,
 * so the page and the logic can be tested before the wallet is funded.
 * Same input always gives the same result.
 */
export function mockReport(input: CheckInput): Report {
  const seed = hash(`${input.handle ?? ""}${input.coinType ?? ""}`);
  const rand = rng(seed);
  // The sample run on LOFI itself always shows the organic case
  const farmed = /::LOFI::LOFI$/.test(input.coinType ?? "") || input.handle?.toLowerCase() === "lofitheyeti" ? false : seed % 2 === 0;

  // ---- fake X posts
  const posts: Post[] = [];
  const shill = ["huge alpha dont miss this", "this project is going to 100x lfg", "early gem, aping now"];
  const real = [
    "tried the testnet, swaps were fast but the bridge UI is confusing",
    "their docs on the vault design are actually solid",
    "not sure about the tokenomics yet, waiting for the audit",
    "used it for a payout today, fees were basically zero",
    "the team answered my question in discord within minutes",
  ];
  const count = 30 + Math.floor(rand() * 20);
  for (let i = 0; i < count; i++) {
    if (farmed) {
      const a = `bot_${Math.floor(rand() * 8)}`;
      const botNo = Number(a.split("_")[1]);
      posts.push({
        id: `21150000000000${String(i).padStart(5, "0")}`, author: a, followers: botNo * 9, text: shill[Math.floor(rand() * shill.length)], likes: 0, reposts: rand() > 0.8 ? 1 : 0,
        authorJoined: new Date(Date.now() - (5 + botNo * 9) * 86_400_000).toUTCString(), defaultAvatar: botNo % 3 === 0,
      });
    } else {
      const a = `user_${Math.floor(rand() * 60)}`;
      // real people word things differently, so mix an opener with a topic
      const openers = ["honestly", "ok so", "update:", "small thing but", "day 3 using it and", "fwiw", "not gonna lie", "quick take,"];
      const text = `${openers[Math.floor(rand() * openers.length)]} ${real[Math.floor(rand() * real.length)]}, ${["will keep testing", "curious what others think", "still early", "worth a look", "need more data"][Math.floor(rand() * 5)]}`;
      const userNo = Number(a.split("_")[1]);
      posts.push({
        id: `21150000000000${String(i).padStart(5, "0")}`, author: a, followers: 150 + userNo * 140, text, likes: Math.floor(rand() * 40), reposts: Math.floor(rand() * 8),
        authorJoined: new Date(Date.now() - (60 + userNo * 45) * 86_400_000).toUTCString(), verified: userNo % 11 === 0, defaultAvatar: false,
      });
    }
  }
  const social = input.handle ? socialSignals(posts) : null;

  // ---- fake transfers
  let market: MarketSignals | null = null;
  let swaps: SwapSignals | null = null;
  if (input.coinType) {
    market = {
      symbol: input.coinType.split("::").pop(), name: "Sample token", priceUsd: 0.004,
      marketCapUsd: farmed ? 2_400_000 : 4_100_000, fdvUsd: farmed ? 6_000_000 : 4_100_000, liquidityUsd: farmed ? 9_000 : 210_000,
      volume24hUsd: farmed ? 41_000 : 68_000, buys24h: farmed ? 9 : 410, sells24h: farmed ? 6 : 330, pools: farmed ? 1 : 4,
      mainPool: { id: "0xmock", dex: "cetus", liquidityUsd: farmed ? 9_000 : 150_000 }, topPools: ["0xmock"],
      ageDays: farmed ? 4 : 360, holders: farmed ? 310 : 18_400, top10HolderShare: farmed ? 0.82 : 0.31,
    };
    const wallets = Array.from({ length: farmed ? 8 : 140 }, (_, i) => `0x${(seed + i).toString(16).padStart(64, "0")}`);
    const list = Array.from({ length: 200 }, (_, i) => {
      const trader = wallets[Math.floor(rand() * wallets.length)];
      const side = (farmed ? (i % 2 ? "buy" : "sell") : rand() > 0.5 ? "buy" : "sell") as "buy" | "sell";
      const amount = farmed ? 1_000_000_000_000n : BigInt(Math.floor(rand() * 9e12) + 1e9);
      return { trader, side, amount, at: Date.now() - i * (farmed ? 60_000 : 300_000) };
    });
    swaps = summarise("0xmock", list, "mock");
  }

  const base = ruleScore(social, { market, swaps });
  const label = base.score >= 65 ? "Passed the sniff test" : base.score >= 40 ? "Smells a bit off" : "Failed the sniff test";
  const now = new Date().toISOString();
  const paidCalls: PaidCall[] = input.handle
    ? [
        { service: "x-profile", url: "mock", token: "USDC", amountAtomic: "5000", outcome: "mock", at: now },
        { service: "x-search", url: "mock", token: "USDC", amountAtomic: "5000", outcome: "mock", at: now },
        { service: "x-search", url: "mock", token: "USDC", amountAtomic: "5000", outcome: "mock", at: now },
      ]
    : [];

  return {
    input,
    profile: input.handle ? { handle: input.handle, name: `${input.handle} (sample)`, followers: farmed ? 1840 : 24600, bio: "Sample profile. Real lookups run in test and live mode." } : null,
    social,
    market,
    swaps,
    verdict: {
      score: base.score,
      label: base.evidence ? label : "Not enough to sniff",
      summary: farmed
        ? `Most of the noise comes from a small group of low-follower accounts repeating the same lines${swaps ? ", and a handful of wallets keep trading the same size back and forth" : ""}.`
        : `Mentions come from different accounts talking about actual use${swaps ? ", and trading is spread across a wide set of wallets" : ""}.`,
      flags: base.flags,
      positives: base.positives,
    },
    paidCalls,
    mock: true,
    mode: "demo",
    generatedAt: now,
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  // mulberry32
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
