import { NextRequest, NextResponse } from "next/server";
import { writeVerdict } from "@/lib/agent/verdict";
import { useSummaryToken } from "@/lib/summary-token";
import { getCached, updateCached } from "@/lib/cache";
import { publishingOn, publishReport } from "@/lib/publish";
import type { Onchain, PaidCall, Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Second step of a scan, while the person is already reading the result:
 *   1. the agent pays Cencori (through buy) to write its own read on the numbers
 *   2. the finished report is stored on Walrus and recorded on Sui
 * Only accepted with the one-time token from /api/check, for exactly that scan's data.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, input, subject, social, market, swaps, score, report } = body ?? {};
  if (typeof token !== "string" || !useSummaryToken(token, { input, subject, social, market, swaps, score })) {
    return NextResponse.json({ error: "This link has expired. Run the scan again." }, { status: 403 });
  }
  const receipts: PaidCall[] = [];
  const t0 = Date.now();
  const verdict = await writeVerdict(subject, social ?? null, { market: market ?? null, swaps: swaps ?? null }, receipts);

  let onchain: Onchain | undefined;
  if (publishingOn() && report && typeof report === "object") {
    // Publish the server's own data (from the signed fields), never fields the page could have edited
    const full: Report = { ...(report as Report), input, social, market, swaps, verdict, paidCalls: [...((report as Report).paidCalls ?? []), ...receipts] };
    onchain = await publishReport(full);
  }
  console.log("summary timing", JSON.stringify({ subject, ms: Date.now() - t0, paid: receipts.length, published: !!onchain?.txDigest }));
  if (getCached(input)) updateCached(input, { verdict, ...(onchain ? { onchain } : {}) });
  return NextResponse.json({ verdict, paidCalls: receipts, onchain });
}
