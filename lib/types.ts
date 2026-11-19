export type CheckInput = {
  handle?: string; // X handle without @
  coinType?: string; // full Sui coin type, 0x...::module::NAME
};

/** One paid call the agent made through buy (X data and the AI summary). */
export type PaidCall = {
  service: "x-search" | "x-profile" | "cencori";
  url: string;
  token: string;
  amountAtomic: string;
  txHash?: string;
  outcome: "confirmed" | "rejected" | "ambiguous" | "mock";
  network?: "celo" | "celo-sepolia";
  at: string;
};

export type Post = {
  id?: string;
  text: string;
  author: string;
  followers?: number;
  authorJoined?: string;
  verified?: boolean;
  defaultAvatar?: boolean;
  createdAt?: string;
  likes?: number;
  reposts?: number;
  /** Handles tagged in the part of the post the person actually wrote (lowercase) */
  bodyMentions?: string[];
};

export type Profile = {
  handle: string;
  name?: string;
  bio?: string;
  followers?: number;
  joined?: string;
  verified?: boolean;
};

export type AccountTier = "established" | "regular" | "new" | "fake";

export type Account = {
  handle: string;
  posts: number;
  followers?: number;
  ageDays?: number;
  verified?: boolean;
  tier: AccountTier;
  postIds?: string[];
  snippet?: string;
};

export type SocialSignals = {
  posts: number;
  uniqueAuthors: number;
  topAuthorShare: number;
  smallAccountShare: number | null;
  duplicateShare: number;
  avgEngagement: number | null;
  tiers: Record<AccountTier, number>;
  newAccountShare: number | null;
  accounts: Account[];
  samples: Post[];
};

/** The token's market, from DexScreener (pools) and GeckoTerminal (holders) */
export type MarketSignals = {
  symbol?: string;
  name?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd: number; // across all pools
  volume24hUsd: number;
  buys24h: number;
  sells24h: number;
  pools: number;
  mainPool?: { id: string; dex: string; liquidityUsd: number; createdAt?: number };
  /** The deepest pools (up to 3), read for swaps */
  topPools: string[];
  ageDays?: number; // age of the oldest pool
  holders?: number;
  top10HolderShare?: number; // 0 to 1
  /** X handle the token lists on DexScreener, when it has one */
  listedHandle?: string;
};

/** Recent swaps in the token's main pool, read from Sui */
export type SwapSignals = {
  pool: string;
  swaps: number;
  hoursCovered: number;
  traders: number;
  buyers: number;
  sellers: number;
  topTraderShare: number; // share of swaps made by the 10 busiest wallets
  roundTrippers: number; // wallets that bought AND sold inside the window
  repeatSizeWallets: number; // wallets making 3+ swaps of almost the same size
  repeatSizeShare: number; // share of all swaps made by those wallets (bots of any kind)
  washWallets: number; // repeat-size wallets that ALSO buy and sell: trading with themselves
  washShare: number; // share of all swaps made by those wallets
  pools: number; // pools read
  source: "sui-graphql" | "mock";
};

export type VerdictLabel = "Passed the sniff test" | "Smells a bit off" | "Failed the sniff test" | "Not enough to sniff";

export type Verdict = {
  score: number; // 0 to 100, higher = more organic
  label: VerdictLabel;
  summary: string;
  flags: string[];
  positives: string[];
};

/** Where the report was recorded on Sui and Walrus */
export type Onchain = {
  network: "mainnet" | "testnet";
  walrusBlobId?: string;
  walrusUrl?: string;
  txDigest?: string;
  reportId?: string;
  /** Sui recording failed */
  error?: string;
  /** Walrus storage failed (the verdict can still be on Sui) */
  walrusError?: string;
};

export type Report = {
  input: CheckInput;
  profile?: Profile | null;
  postsFound?: number;
  postsTagging?: number;
  social: SocialSignals | null;
  market: MarketSignals | null;
  swaps: SwapSignals | null;
  verdict: Verdict;
  paidCalls: PaidCall[];
  onchain?: Onchain;
  mock: boolean;
  mode: "demo" | "test" | "live";
  generatedAt: string;
  cachedAt?: string;
  summaryToken?: string;
  partial?: boolean;
};
