/**
 * Makes a fresh Sui wallet for the server, which publishes each report on Sui.
 * Fund it with a little SUI (and WAL if you use a Walrus mainnet publisher). Treat it as spent.
 * Run: npm run wallet
 */
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const kp = new Ed25519Keypair();
console.log("\nNew Yeti Scout publisher wallet\n");
console.log("Address:     ", kp.toSuiAddress());
console.log("Private key: ", kp.getSecretKey());
console.log("\nPut the private key in PUBLISHER_PRIVATE_KEY (Vercel env). Never share it or commit it.\n");
