import { fetchProfile, searchXPages, socialSignals } from "./social";
import { marketSignals } from "./market";
import { swapSignals } from "./swaps";
import { writeVerdict, ruleVerdict } from "./verdict";
import { mockReport } from "./mock";
import { mode, isMock, isSandbox } from "./mode";
import type { CheckInput, MarketSignals, PaidCall, Profile, Report } from "@/lib/types";
import { getCached, putCached } from "@/lib/cache";
import { makeSummaryToken } from "@/lib/summary-token";

export { isMock, isSandbox, mode };

/** An error the user should see as-is (and that doesn't use up a scan). */
export class CheckError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const subjectOf = (i: CheckInput, market?: MarketSignals | null) =>
  [i.handle && `@${i.handle}`, i.coinType && (market?.symbol ? `$${market.symbol} (${i.coinType})` : i.coinType)]
    .filter(Boolean)
    .join(" / ");

/**
 * One scan. Returns as soon as the data is in, with the rule verdict and a token
 * the page uses to have the AI summary written (and the report recorded on Sui) next.
 */
/** Steps of a scan, reported to the page as each one finishes */
export type Stage = "pools" | "swaps" | "x" | "score";

export async function runCheck(input: CheckInput, opts: { skipCache?: boolean; onStage?: (s: Stage, ok: boolean) => void } = {}): Promise<Report> {
  const stage = (s: Stage, ok = true) => { try { opts.onStage?.(s, ok); } catch { /* the page went away */ } };
  if (isMock()) { (["pools", "swaps", "x", "score"] as Stage[]).forEach((s) => stage(s)); return mockReport(input); }
  const cached = opts.skipCache ? null : getCached(input);
  if (cached) { (["pools", "swaps", "x", "score"] as Stage[]).forEach((s) => stage(s)); return { ...cached, summaryToken: undefined }; }
  const sandbox = isSandbox();
  const t0 = Date.now();
  const took: Record<string, number> = {};
  const lap = <T,>(name: string, p: Promise<T>) => p.finally(() => { took[name] = Date.now() - t0; });
  const receipts: PaidCall[] = [];
  const errors: string[] = [];

  // Step 1: the market (gives us the main pool and, often, the project's X handle) and the X profile
  const [market, givenProfile] = await Promise.all([
    input.coinType
      ? lap("market", marketSignals(input.coinType))
          .then((m) => { stage("pools"); return m; })
          .catch((e) => { console.error("market read failed", e); errors.push("market"); stage("pools", false); return null; })
      : Promise.resolve(null),
    input.handle
      ? lap("profile", fetchProfile(input.handle.toLowerCase(), receipts)).catch((e) => { console.error("profile lookup failed", e); return undefined; })
      : Promise.resolve(undefined as Profile | null | undefined),
  ]);

  if (input.coinType && market && market.pools === 0 && !input.handle && !market.listedHandle) {
    throw new CheckError("No DEX pools found for that coin type on Sui. Check it, or add the project's X handle.", 404);
  }

  // A coin with no handle given: use the X account it lists on DexScreener
  const handle = (input.handle ?? market?.listedHandle)?.toLowerCase();
  let profile = givenProfile;
  let postsFound = 0;
  let postsTagging = 0;

  // Step 2: X posts and Sui swaps, side by side
  const [social, swaps, autoProfile] = await Promise.all([
    handle
      ? (async () => {
          const q = `@${handle} -from:${handle} within_time:7d`;
          // Either search on its own is enough to judge from, so one failing doesn't drop the X section
          const results = await Promise.allSettled([
            lap("xLatest", searchXPages(q, "latest", 1, receipts)),
            lap("xTop", searchXPages(q, "top", 1, receipts)),
          ]);
          const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof searchXPages>>> => r.status === "fulfilled");
          if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
          results.forEach((r) => r.status === "rejected" && console.error("one x search failed", r.reason));
          const [latest, top] = [ok[0].value, ok[1]?.value ?? []];
          const found = [...new Map([...latest, ...top].map((p) => [p.id ?? p.text, p])).values()];
          postsFound = found.length;
          const tagging = found.filter((p) => p.author !== handle && (p.bodyMentions ?? []).includes(handle));
          postsTagging = tagging.length;
          const sig = socialSignals(tagging);
          stage("x");
          return sig;
        })().catch((e) => { console.error("x search failed", e); errors.push("x"); stage("x", false); return null; })
      : Promise.resolve(null),
    input.coinType && market?.topPools.length
      ? lap("swaps", swapSignals(input.coinType, market.topPools))
          .then((w) => { stage("swaps"); return w; })
          .catch((e) => { console.error("swap read failed", e); errors.push("swaps"); stage("swaps", false); return null; })
      : Promise.resolve(null),
    // A handle found on DexScreener is the project's own listing, so it needs no paid profile lookup
    Promise.resolve(undefined as Profile | null | undefined),
  ]);
  if (autoProfile !== undefined) profile = autoProfile;

  if (input.handle && profile === null && postsTagging === 0) {
    throw new CheckError(`Couldn't find @${input.handle} on X. Check the handle and try again.`, 404);
  }
  if (!social && !market && !swaps && errors.length) {
    throw new Error(`All data sources failed (${errors.join(", ")})`);
  }

  const onchain = { market, swaps };
  const outInput: CheckInput = { ...input, handle: handle ?? input.handle };
  const subject = subjectOf(outInput, market);
  const verdict = ruleVerdict(social, onchain);
  stage("score");
  const summaryToken = !sandbox ? makeSummaryToken({ input: outInput, subject, social, market, swaps, score: verdict.score }) : undefined;
  console.log("check timing", JSON.stringify({ subject, ms: Date.now() - t0, steps: took, errors }));

  const report: Report = {
    input: outInput,
    profile: profile ?? null,
    postsFound,
    postsTagging,
    social,
    market,
    swaps,
    verdict,
    paidCalls: receipts,
    summaryToken,
    ...(errors.length ? { partial: true } : {}),
    mock: false,
    mode: mode(),
    generatedAt: new Date().toISOString(),
  };
  if (!errors.length) putCached(input, report);
  return report;
}

// Kept for the summary route
export { writeVerdict };
