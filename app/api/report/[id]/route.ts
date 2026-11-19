import { NextRequest, NextResponse } from "next/server";
import { readReport } from "@/lib/publish";

export const runtime = "nodejs";

/** One frozen ScoutReport from Sui, with its full report from Walrus */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(id)) return NextResponse.json({ error: "Not a report id." }, { status: 400 });
  try {
    const found = await readReport(id);
    if (!found) return NextResponse.json({ error: "No Yeti Scout report at that address." }, { status: 404 });
    return NextResponse.json(found, { headers: { "cache-control": "s-maxage=3600" } });
  } catch (e) {
    console.error("report read failed", e);
    return NextResponse.json({ error: "Couldn't read Sui right now." }, { status: 502 });
  }
}
