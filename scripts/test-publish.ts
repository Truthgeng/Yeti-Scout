/**
 * Records one sample report the full way: Walrus, then Sui through the yeti_scout package.
 * Reads the SCOUT_* ids and PUBLISHER_PRIVATE_KEY from .env.local.
 * Run: npm run test:publish
 */
import { existsSync, readFileSync } from "node:fs";

// Load .env.local into process.env before the publisher reads its settings
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { publishingOn, publishReport } = await import("../lib/publish");
const { mockReport } = await import("../lib/agent/mock");

if (!publishingOn()) {
  console.error("\nMissing settings. .env.local needs PUBLISH_NETWORK, SCOUT_PACKAGE_ID, SCOUT_OBJECT_ID, SCOUT_ADMIN_CAP_ID and PUBLISHER_PRIVATE_KEY.\n");
  process.exit(1);
}

const report = mockReport({ coinType: "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI", handle: "lofitheyeti" });
console.log(`\nRecording a sample report (${report.verdict.score}/100, ${report.verdict.label})...`);
const out = await publishReport({ ...report, mock: true });

if (out.walrusBlobId) console.log(`  OK   Walrus: ${out.walrusUrl}`);
if (out.txDigest) console.log(`  OK   Sui ${out.network}: https://suiscan.xyz/${out.network}/tx/${out.txDigest}`);
if (out.error) console.log(`  FAIL ${out.error}`);
console.log("\nPaste this output back to Claude.\n");
