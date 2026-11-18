import { NextRequest, NextResponse } from "next/server";
import { mode } from "@/lib/agent/mode";
import { COOKIE, FREE_CHECKS, freeLeft } from "@/lib/free";
import { HOLD_USD, HOLDER_DAILY_SCANS, lofiNeeded } from "@/lib/gate";
import { publishingOn } from "@/lib/publish";
import { LOFI_COIN_TYPE } from "@/lib/sui";

export const dynamic = "force-dynamic";

/** Mode, the LOFI holding rule, and how many free scans this visitor has left */
export async function GET(req: NextRequest) {
  const m = mode();
  return NextResponse.json({
    mode: m,
    gated: m === "live",
    freeChecks: FREE_CHECKS,
    freeLeft: m === "live" ? freeLeft(req.cookies.get(COOKIE)?.value) : null,
    holdUsd: HOLD_USD,
    holderDailyScans: HOLDER_DAILY_SCANS,
    lofiNeeded: m === "live" ? await lofiNeeded().catch(() => undefined) : undefined,
    lofiCoinType: LOFI_COIN_TYPE,
    publishing: publishingOn(),
    publishNetwork: process.env.PUBLISH_NETWORK === "mainnet" ? "mainnet" : "testnet",
  });
}
