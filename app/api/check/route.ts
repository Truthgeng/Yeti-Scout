import { NextRequest, NextResponse } from "next/server";
import { runCheck, CheckError } from "@/lib/agent/run";
import { isMock, isSandbox } from "@/lib/agent/mode";
import type { CheckInput } from "@/lib/types";
import { isCoinType, normaliseCoinType } from "@/lib/sui";
import { COOKIE, freeLeft, nextCookie, takeDailySlot } from "@/lib/free";
import { checkHolding, HOLDER_COOKIE, readHolder, scansLeft, useScan } from "@/lib/gate";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseInput(body: any): CheckInput | string {
  let handle = typeof body?.handle === "string" ? body.handle.trim() : "";
  const link = handle.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i);
  handle = (link ? link[1] : handle).replace(/^@/, "");
  let coin = typeof body?.coinType === "string" ? body.coinType.trim() : "";
  // Accept a pasted SuiScan / SuiVision / DexScreener link that ends in the coin type
  const inLink = coin.match(/(0x[0-9a-fA-F]{1,64}::\w+::\w+)/);
  if (inLink) coin = inLink[1];
  if (!handle && !coin) return "Enter an X handle, a Sui coin type, or both.";
  if (handle && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return "That X handle doesn't look right.";
  if (coin && !isCoinType(coin)) return "That doesn't look like a Sui coin type. It should look like 0x...::module::NAME.";
  return { handle: handle || undefined, coinType: coin ? normaliseCoinType(coin) : undefined };
}

/**
 * Runs the scan and streams its progress as newline-separated JSON, so the page can
 * tick off each step as it really finishes:
 *   {"type":"stage","stage":"pools","ok":true}  ...  {"type":"done","report":{...}}
 *   or {"type":"error","error":"...","refund":"<cookie>"}
 * onDone runs only when the scan succeeded (used to count a holder's scan).
 */
function scan(input: CheckInput, extra: { headers?: Headers; refund?: string; onDone?: () => void } = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    // Not awaited: start() returning early lets each step reach the page as it happens
    start(ctrl) { void (async () => {
      const send = (o: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* closed */ } };
      try {
        const report = await runCheck(input, { onStage: (stage, ok) => send({ type: "stage", stage, ok }) });
        extra.onDone?.();
        send({ type: "done", report });
      } catch (e) {
        if (!(e instanceof CheckError)) console.error(e);
        send({
          type: "error",
          error: e instanceof CheckError ? e.message : "The scan failed. It didn't count against your scans.",
          ...(extra.refund !== undefined ? { refund: extra.refund } : {}),
        });
      } finally {
        ctrl.close();
      }
    })(); },
  });
  const headers = extra.headers ?? new Headers();
  headers.set("content-type", "application/x-ndjson; charset=utf-8");
  headers.set("cache-control", "no-store, no-transform");
  headers.set("x-accel-buffering", "no");
  return new Response(stream, { headers });
}

/**
 * Who can scan:
 *   - anyone, for FREE_CHECKS scans (default 2), no wallet needed
 *   - wallets holding HOLD_USD worth of LOFI, HOLDER_DAILY_SCANS a day
 * Demo and test mode are open to everyone.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const input = parseInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  if (isMock() || isSandbox()) return scan(input);

  // A signed-in LOFI holder
  const holder = readHolder(req.cookies.get(HOLDER_COOKIE)?.value);
  if (holder) {
    const holding = await checkHolding(holder).catch(() => null);
    if (holding?.holds) {
      if (scansLeft(holder) === 0) {
        return NextResponse.json({ error: "You've used today's scans. They reset at midnight UTC." }, { status: 429 });
      }
      return scan(input, { onDone: () => useScan(holder) });
    }
    // Signed in but no longer holding enough: falls through to the free scans
  }

  const cookie = req.cookies.get(COOKIE)?.value;
  if (freeLeft(cookie) === 0) {
    return NextResponse.json(
      { error: "Your free scans are used up. Hold LOFI in a Sui wallet to keep scanning.", needsLofi: true },
      { status: 402 },
    );
  }
  if (!takeDailySlot()) {
    return NextResponse.json({ error: "Free scans are used up for today. Connect a wallet holding LOFI to keep going.", needsLofi: true }, { status: 429 });
  }
  // The free scan is counted up front (headers go out before the stream). If it fails,
  // the error carries the old cookie so the page can hand the scan back via /api/free.
  const headers = new Headers();
  headers.append("set-cookie", freeCookieHeader(nextCookie(cookie)));
  return scan(input, { headers, refund: cookie ?? "" });
}

function freeCookieHeader(value: string) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=Lax`;
}
