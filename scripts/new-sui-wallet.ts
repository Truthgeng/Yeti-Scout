/**
 * Makes a fresh Sui wallet for the server, which publishes the Move package and
 * records each report on Sui. The key is saved straight into .env.local (ignored
 * by git) so you never have to copy it around. Treat this wallet as spent: only
 * keep a little SUI in it.
 * Run: npm run wallet
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const file = ".env.local";
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const existing = current.split("\n").find((l) => l.trim().startsWith("PUBLISHER_PRIVATE_KEY="));

if (existing) {
  const kp = Ed25519Keypair.fromSecretKey(existing.split("=").slice(1).join("=").trim());
  console.log(`\nYou already have a publisher wallet in ${file}:\n\n  ${kp.toSuiAddress()}\n`);
  process.exit(0);
}

const kp = new Ed25519Keypair();
appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}PUBLISHER_PRIVATE_KEY=${kp.getSecretKey()}\n`);
console.log(`\nNew Yeti Scout publisher wallet, key saved to ${file}:\n\n  ${kp.toSuiAddress()}\n`);
console.log(`Free testnet SUI: https://faucet.sui.io/?address=${kp.toSuiAddress()}\n`);
console.log("Never share the key or commit it. .env.local is ignored by git.\n");
