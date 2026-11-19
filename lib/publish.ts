import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import type { Onchain, Report } from "@/lib/types";

/**
 * Records every finished scan in public:
 *   1. the full report (JSON) is stored on Walrus
 *   2. a ScoutReport object is published on Sui by the yeti_scout Move package,
 *      holding the score, verdict and the Walrus blob id
 *
 * Needs PUBLISH_NETWORK, SCOUT_PACKAGE_ID, SCOUT_OBJECT_ID, SCOUT_ADMIN_CAP_ID,
 * PUBLISHER_PRIVATE_KEY (suiprivkey...) and WALRUS_PUBLISHER_URL. Off until they are set.
 */

const network = (process.env.PUBLISH_NETWORK === "mainnet" ? "mainnet" : "testnet") as Onchain["network"];

const DEFAULTS = {
  testnet: {
    graphql: "https://graphql.testnet.sui.io/graphql",
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
  },
  mainnet: {
    graphql: "https://graphql.mainnet.sui.io/graphql",
    publisher: "", // there is no free public publisher on mainnet: set WALRUS_PUBLISHER_URL
    aggregator: "https://aggregator.walrus-mainnet.walrus.space",
  },
};

const cfg = () => ({
  network,
  graphql: process.env.PUBLISH_GRAPHQL_URL || DEFAULTS[network].graphql,
  publishers: (process.env.WALRUS_PUBLISHER_URL || "").split(",").map((u) => u.trim()).filter(Boolean),
  aggregator: process.env.WALRUS_AGGREGATOR_URL || DEFAULTS[network].aggregator,
  epochs: Number(process.env.WALRUS_EPOCHS || "5"),
  pkg: process.env.SCOUT_PACKAGE_ID,
  scout: process.env.SCOUT_OBJECT_ID,
  cap: process.env.SCOUT_ADMIN_CAP_ID,
  key: process.env.PUBLISHER_PRIVATE_KEY,
});

export const publishingOn = () => {
  const c = cfg();
  return !!(c.pkg && c.scout && c.cap && c.key);
};

export const walrusUrl = (blobId: string) => `${cfg().aggregator}/v1/blobs/${blobId}`;
export const explorerTx = (digest: string, net: Onchain["network"]) => `https://suiscan.xyz/${net}/tx/${digest}`;

/**
 * Public testnet publishers pay for storage from their own WAL and sometimes run dry,
 * so the report is offered to several in turn (Mysten Labs first, then community operators
 * from the official Walrus operator list). WALRUS_PUBLISHER_URL overrides the list.
 */
const TESTNET_PUBLISHERS = [
  "https://publisher.walrus-testnet.walrus.space",
  "https://wal-publisher-testnet.staketab.org",
  "https://publisher.walrus.banansen.dev",
  "https://walrus-publisher-testnet.n1stake.com",
  "https://sui-walrus-testnet-publisher.bwarelabs.com",
  "https://publisher.walrus-testnet.h2o-nodes.com",
  "https://walrus-publisher-testnet.staking4all.org",
  "https://testnet-publisher.walrus.graphyte.dev",
];

/** Stores the report JSON on Walrus and returns its blob id */
async function storeOnWalrus(report: unknown): Promise<string> {
  const c = cfg();
  const list = c.publishers.length ? c.publishers : c.network === "testnet" ? TESTNET_PUBLISHERS : [];
  if (!list.length) throw new Error("WALRUS_PUBLISHER_URL is not set");
  const body = JSON.stringify(report);
  const errors: string[] = [];
  const started = Date.now();
  for (const pub of list) {
    if (Date.now() - started > 90_000) break;
    try {
      const res = await fetch(`${pub}/v1/blobs?epochs=${c.epochs}`, { method: "PUT", body, signal: AbortSignal.timeout(25_000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 120)}`);
      const j = JSON.parse(text);
      const id = j?.newlyCreated?.blobObject?.blobId ?? j?.alreadyCertified?.blobId;
      if (!id) throw new Error(`no blob id: ${text.slice(0, 120)}`);
      if (errors.length) console.warn("walrus: earlier publishers failed", JSON.stringify(errors));
      return id;
    } catch (e) {
      errors.push(`${new URL(pub).host} ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
    }
  }
  console.error("walrus: every publisher failed", JSON.stringify(errors));
  throw new Error("Walrus storage is unavailable right now");
}

/** What goes on Walrus: the signals and verdict. Data bills and the one-time token stay private. */
export function publicReport(r: Report) {
  const { summaryToken, cachedAt, paidCalls, ...rest } = r;
  return { app: "Yeti Scout", version: 1, ...rest };
}

export async function publishReport(r: Report): Promise<Onchain> {
  const c = cfg();
  const out: Onchain = { network: c.network };
  try {
    // Walrus first, but a Walrus outage must not stop the verdict being frozen on Sui
    try {
      out.walrusBlobId = await storeOnWalrus(publicReport(r));
      out.walrusUrl = walrusUrl(out.walrusBlobId);
    } catch (e) {
      out.walrusError = e instanceof Error ? e.message : String(e);
    }

    const signer = Ed25519Keypair.fromSecretKey(c.key!);
    const client = new SuiGraphQLClient({ url: c.graphql, network: c.network });
    const tx = new Transaction();
    tx.moveCall({
      target: `${c.pkg}::report::publish`,
      arguments: [
        tx.object(c.cap!),
        tx.object(c.scout!),
        tx.pure.string(r.input.coinType ?? ""),
        tx.pure.string(r.input.handle ?? ""),
        tx.pure.string(r.market?.symbol ?? ""),
        tx.pure.u8(Math.max(0, Math.min(100, Math.round(r.verdict.score)))),
        tx.pure.string(r.verdict.label),
        tx.pure.string(out.walrusBlobId ?? ""),
        tx.object.clock(),
      ],
    });
    const result = await signer.signAndExecuteTransaction({ transaction: tx, client });
    const done = result.Transaction ?? result.FailedTransaction;
    out.txDigest = done?.digest;
    if (result.$kind === "FailedTransaction") out.error = "The Sui transaction failed";
  } catch (e) {
    console.error("publish failed", e);
    out.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  return out;
}
