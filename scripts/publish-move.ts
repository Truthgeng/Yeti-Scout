/**
 * Publishes the yeti_scout Move package without the Sui CLI.
 *
 * The package in move/ is already compiled to move/bytecode.json. This script
 * sends it to Sui from the wallet in PUBLISHER_PRIVATE_KEY (.env.local) and prints
 * the ids to paste into Vercel.
 *
 *   npm run wallet          make the publisher wallet, put its key in .env.local
 *   (fund it)               testnet: https://faucet.sui.io
 *   npm run publish:move    publishes on testnet (add -- mainnet for mainnet)
 */
import { readFileSync, existsSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

const network = process.argv[2] === "mainnet" ? "mainnet" : "testnet";

// Read PUBLISHER_PRIVATE_KEY from .env.local without printing it
function envKey(): string | undefined {
  if (process.env.PUBLISHER_PRIVATE_KEY) return process.env.PUBLISHER_PRIVATE_KEY;
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8").split("\n").find((l) => l.trim().startsWith("PUBLISHER_PRIVATE_KEY="));
    const v = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  }
}

const key = envKey();
if (!key?.startsWith("suiprivkey")) {
  console.error("\nPUBLISHER_PRIVATE_KEY is missing from .env.local. Run `npm run wallet` first and add the key there.\n");
  process.exit(1);
}

const signer = Ed25519Keypair.fromSecretKey(key);
const address = signer.toSuiAddress();
const client = new SuiGraphQLClient({ url: `https://graphql.${network}.sui.io/graphql`, network });
const { modules, dependencies } = JSON.parse(readFileSync("move/bytecode.json", "utf8"));

console.log(`\nPublishing yeti_scout on Sui ${network} from ${address}`);

const { balance } = await client.core.getBalance({ owner: address });
const sui = Number(balance.balance) / 1e9;
console.log(`Wallet balance: ${sui} SUI`);
if (sui < 0.05) {
  console.error(
    network === "testnet"
      ? `\nNot enough SUI. Get free testnet SUI at https://faucet.sui.io/?address=${address} then run this again.\n`
      : `\nNot enough SUI. Send about 0.5 SUI to ${address} then run this again.\n`,
  );
  process.exit(1);
}

const tx = new Transaction();
const upgradeCap = tx.publish({ modules, dependencies });
tx.transferObjects([upgradeCap], address);
tx.setGasBudget(200_000_000);

const result = await client.signAndExecuteTransaction({
  transaction: tx,
  signer,
  include: { effects: true, objectTypes: true },
});

if (result.$kind === "FailedTransaction") {
  console.error("\nPublish failed:", JSON.stringify(result.FailedTransaction?.effects?.status ?? result, null, 2));
  process.exit(1);
}

const done = result.Transaction!;
const created = (done.effects?.changedObjects ?? []).filter((o) => o.idOperation === "Created");
const types = done.objectTypes ?? {};
const pkg = created.find((o) => o.outputState === "PackageWrite")?.objectId;
const find = (suffix: string) => created.find((o) => types[o.objectId]?.endsWith(suffix))?.objectId;

console.log(`\nPublished. Transaction: https://suiscan.xyz/${network}/tx/${done.digest}\n`);
console.log("Put these in Vercel (and .env.local):\n");
console.log(`PUBLISH_NETWORK=${network}`);
console.log(`SCOUT_PACKAGE_ID=${pkg}`);
console.log(`SCOUT_OBJECT_ID=${find("::report::Scout")}`);
console.log(`SCOUT_ADMIN_CAP_ID=${find("::report::AdminCap")}`);
console.log(`\nPackage ID for the hackathon form: ${pkg}\n`);
