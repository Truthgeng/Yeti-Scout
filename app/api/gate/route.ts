import { NextRequest, NextResponse } from "next/server";
import { checkHolding, HOLDER_COOKIE, holderCookie, readHolder, scansLeft, verifySignIn } from "@/lib/gate";

export const runtime = "nodejs";

/** Sign in with a Sui wallet: checks the signature, then whether the wallet holds enough LOFI. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { address, issuedAt, signature } = body ?? {};
  if (typeof address !== "string" || typeof issuedAt !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "Missing sign-in details." }, { status: 400 });
  }
  let owner: string;
  try {
    owner = await verifySignIn({ address, issuedAt, signature, host: req.headers.get("host") ?? "" });
  } catch (e) {
    console.warn("sign-in rejected", JSON.stringify({ wallet: `${String(address).slice(0, 8)}…`, reason: e instanceof Error ? e.message.slice(0, 160) : String(e) }));
    return NextResponse.json({ error: e instanceof Error && e.message.includes("expired") ? e.message : "That signature didn't check out. Try connecting again." }, { status: 401 });
  }
  try {
    const holding = await checkHolding(owner);
    console.log("sign-in", JSON.stringify({ wallet: `${owner.slice(0, 8)}…${owner.slice(-4)}`, lofi: Math.round(holding.lofi), needed: holding.needed, holds: holding.holds }));
    const res = NextResponse.json({ ...holding, scansLeft: scansLeft(owner) });
    res.cookies.set(HOLDER_COOKIE, holderCookie(owner), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 });
    return res;
  } catch (e) {
    console.error("balance check failed", e);
    return NextResponse.json({ error: "Couldn't read your LOFI balance from Sui right now. Try again in a minute." }, { status: 502 });
  }
}

/** Current holder status, for the page on load */
export async function GET(req: NextRequest) {
  const owner = readHolder(req.cookies.get(HOLDER_COOKIE)?.value);
  if (!owner) return NextResponse.json({ signedIn: false });
  try {
    return NextResponse.json({ signedIn: true, ...(await checkHolding(owner)), scansLeft: scansLeft(owner) });
  } catch {
    return NextResponse.json({ signedIn: true, address: owner, holds: null, scansLeft: scansLeft(owner) });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ signedIn: false });
  res.cookies.delete(HOLDER_COOKIE);
  return res;
}
