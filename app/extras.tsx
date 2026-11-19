"use client";

import { useEffect, useState } from "react";

type StageState = Record<string, "done" | "failed">;

/** Live scan steps, ticked off by the server as each one really finishes */
export function Progress({ stages, coin, handle }: { stages: StageState; coin: boolean; handle: boolean }) {
  const steps: { key: string; label: string }[] = [
    ...(coin ? [{ key: "pools", label: "Reading pools across Sui DEXes" }, { key: "swaps", label: "Reading recent swaps on Sui" }] : []),
    { key: "x", label: coin && !handle ? "Checking posts on X (handle from the token's listing)" : "Checking posts on X" },
    { key: "score", label: "Running the sniff test" },
  ];
  const current = steps.find((s) => !stages[s.key])?.key;
  return (
    <ol className="progress" aria-live="polite">
      {steps.map((s) => {
        const st = stages[s.key] ?? (s.key === current ? "now" : "wait");
        return (
          <li key={s.key} className={`step ${st}`}>
            <span className="dot" aria-hidden>{st === "done" ? "✓" : st === "failed" ? "–" : ""}</span>
            {s.label}
            {st === "failed" && <span className="muted"> (skipped)</span>}
          </li>
        );
      })}
    </ol>
  );
}

type Recent = { reportId: string; number: number; coinType: string; handle: string; symbol: string; score: number; verdict: string; scannedAt: number; txDigest?: string };

const ago = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const tone = (s: number) => (s >= 65 ? "good" : s >= 40 ? "mid" : "bad");

/** The latest verdicts, read back from the yeti_scout package's events on Sui */
export function RecentFeed({ refreshKey }: { refreshKey?: string }) {
  const [list, setList] = useState<Recent[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/recent", { cache: "no-store" }).then((r) => r.json()).then((d) => setList(d.reports ?? [])).catch(() => setList([]));
    }, refreshKey ? 2500 : 0); // give Sui a moment to index a report that was just published
    return () => clearTimeout(t);
  }, [refreshKey]);
  if (!list || !list.length) return null;
  return (
    <section className="recent" id="recent">
      <div className="recent-head">
        <h2>Recently sniffed</h2>
        <p className="muted">Read live from Sui. Every verdict here is a frozen object that nobody can edit.</p>
      </div>
      <div className="recent-list">
        {list.map((r) => (
          <a key={r.reportId} className="recent-row" href={`/r/${r.reportId}`}>
            <span className={`pill-score ${tone(r.score)}`}>{r.score}</span>
            <span className="recent-who">
              <b>{r.symbol ? `$${r.symbol}` : r.handle ? `@${r.handle}` : "Token"}</b>
              {r.symbol && r.handle && <span className="muted"> @{r.handle}</span>}
            </span>
            <span className={`recent-verdict ${tone(r.score)}`}>{r.verdict}</span>
            <span className="muted recent-time">#{r.number} · {ago(r.scannedAt)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
