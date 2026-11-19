import { NextRequest, NextResponse } from "next/server";
import { COOKIE, usedFree, FREE_CHECKS } from "@/lib/free";

export const runtime = "nodejs";

/**
 * Hands back a free scan after a failed one. The page sends the cookie value from
 * before the scan; it's only accepted if it's genuinely signed, so the most anyone
 * can do is go back to an earlier count, the same as clearing cookies.
 */
export async function POST(req: NextRequest) {
  const { cookie } = (await req.json().catch(() => ({}))) ?? {};
  const res = NextResponse.json({ ok: true });
  if (cookie === "") { res.cookies.delete(COOKIE); return res; }
  if (typeof cookie !== "string" || usedFree(cookie) >= FREE_CHECKS && !cookie.startsWith(`${FREE_CHECKS}.`)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  res.cookies.set(COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
