import { NextResponse } from "next/server";
import { recentReports } from "@/lib/publish";

export const runtime = "nodejs";
export const revalidate = 30;

/** The latest verdicts Yeti Scout froze on Sui, read back from the chain */
export async function GET() {
  try {
    return NextResponse.json({ reports: await recentReports(12) }, { headers: { "cache-control": "s-maxage=30, stale-while-revalidate=120" } });
  } catch (e) {
    console.error("recent feed failed", e);
    return NextResponse.json({ reports: [], error: "Couldn't read Sui right now." }, { status: 502 });
  }
}
