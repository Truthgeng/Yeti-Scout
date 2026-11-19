"use client";

import { useState } from "react";
import type { AccountTier, Report } from "@/lib/types";

export const LOFI = "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI";
export const BUY_LOFI = `https://app.cetus.zone/swap/?from=0x2::sui::SUI&to=${LOFI}`;

const TIERS: { key: AccountTier; label: string; hint: string }[] = [
  { key: "established", label: "Established", hint: "1k+ followers, over a year old" },
  { key: "regular", label: "Regular", hint: "200+ followers, over 3 months old" },
  { key: "new", label: "New or tiny", hint: "under 3 months old or under 200 followers" },
  { key: "fake", label: "Likely fake", hint: "default picture, or brand new with no followers" },
];

export const compact = (n?: number) =>
  n === undefined ? "?" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n));
const usd = (n?: number) => (n === undefined ? "?" : `$${compact(n)}`);
const age = (d?: number) => (d === undefined ? "?" : d < 60 ? `${d}d` : d < 730 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const tone = (s: number) => (s >= 65 ? "good" : s >= 40 ? "mid" : "bad");

export function walletMessage(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/reject|denied|cancel|declin|closed/.test(m)) return "Cancelled in the wallet.";
  return `Couldn't connect: ${err instanceof Error ? err.message : String(err)}`.slice(0, 180);
}

function shareUrl(r: Report) {
  const who = r.market?.symbol ? `$${r.market.symbol}` : r.input.handle ? `@${r.input.handle}` : "this token";
  const text = `Ran ${who} through Yeti Scout.\n\n${r.verdict.score}/100. ${r.verdict.label}.\n\nThe verdict is frozen on Sui. Sniff any Sui token before you ape:`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Once the report is on Sui, share the report itself, not just the homepage
  const url = r.onchain?.reportId ? `${origin}/r/${r.onchain.reportId}` : origin;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function Ring({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ${tone(score)}`} viewBox="0 0 128 128" role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx="64" cy="64" r={r} className="ring-bg" />
      <circle cx="64" cy="64" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      <text x="64" y="70" textAnchor="middle" className="ring-num">{score}</text>
    </svg>
  );
}

function WhoIsPosting({ social }: { social: NonNullable<Report["social"]> }) {
  const total = TIERS.reduce((a, t) => a + social.tiers[t.key], 0) || 1;
  const [open, setOpen] = useState(false);
  const shown = open ? social.accounts : social.accounts.slice(0, 5);
  return (
    <div className="panel wide">
      <h3>Who's posting about it</h3>
      <div className="tierbar" role="img" aria-label="Share of posting accounts by quality">
        {TIERS.map((t) => social.tiers[t.key] > 0 && <span key={t.key} className={`tier-${t.key}`} style={{ width: `${(social.tiers[t.key] / total) * 100}%` }} />)}
      </div>
      <ul className="legend">
        {TIERS.map((t) => <li key={t.key} title={t.hint}><i className={`tier-${t.key}`} />{t.label} <b>{social.tiers[t.key]}</b></li>)}
      </ul>
      <div className="accounts">
        {shown.map((a) => {
          const id = a.postIds?.[0];
          return (
            <a key={a.handle} className="acct" href={id ? `https://x.com/${a.handle}/status/${id}` : `https://x.com/${a.handle}`} target="_blank" rel="noreferrer">
              <span className="acct-top"><b>@{a.handle}</b><span className={`chip tier-${a.tier}`}>{TIERS.find((t) => t.key === a.tier)!.label}</span></span>
              <span className="acct-meta">{compact(a.followers)} followers · {age(a.ageDays)} old · {a.posts} post{a.posts === 1 ? "" : "s"}</span>
              {a.snippet && <span className="acct-snippet">{a.snippet}{a.snippet.length >= 140 ? "…" : ""}</span>}
            </a>
          );
        })}
      </div>
      {social.accounts.length > 5 && <button className="ghost" onClick={() => setOpen(!open)}>{open ? "Show fewer" : `Show all ${social.accounts.length}`}</button>}
    </div>
  );
}


/** The finished report: used on the scan page and on shared report pages (/r/...) */
export function ReportView({ report, writing = false, resultRef, shared = false }: { report: Report; writing?: boolean; resultRef?: React.Ref<HTMLElement>; shared?: boolean }) {
  return (

          <section className="result" ref={resultRef}>
            <div className="bento">
              <div className="panel verdict wide">
                <Ring score={report.verdict.score} />
                <div>
                  <p className="who">
                    {report.market?.symbol && <b>${report.market.symbol}</b>}
                    {report.input.handle && <span>@{report.profile?.handle ?? report.input.handle}</span>}
                    {report.mock && <span className="chip">sample data</span>}
                  </p>
                  <h2 key={report.generatedAt} className={`label ${tone(report.verdict.score)}`}>{report.verdict.label}</h2>
                  <p className="summary">{report.verdict.summary}</p>
                  {writing && <p className="writing">The agent is writing its own read and recording this on Sui…</p>}
                  {report.partial && <p className="hint warn">One data source failed, so this scan may be incomplete.</p>}
                  <div className="verdict-actions">
                    {report.input.coinType === LOFI && (
                      <a className="btn small primary" href={BUY_LOFI} target="_blank" rel="noreferrer">Buy $LOFI on Cetus</a>
                    )}
                    {shared
                      ? <a className="btn small" href="/">Run your own scan</a>
                      : <a className="btn small" href={shareUrl(report)} target="_blank" rel="noreferrer">{writing ? "Share on X (link ready soon)" : "Share on X"}</a>}
                    {report.onchain?.reportId && !shared && <a className="btn small" href={`/r/${report.onchain.reportId}`}>Open report page</a>}
                  </div>
                </div>
              </div>

              {report.market && report.market.pools !== undefined && (
                <div className="panel">
                  <h3>Market</h3>
                  <div className="stats">
                    <div><b>{usd(report.market.marketCapUsd)}</b><span>market cap</span></div>
                    {report.market.fdvUsd !== undefined && <div><b>{usd(report.market.fdvUsd)}</b><span>FDV</span></div>}
                    <div><b>{usd(report.market.liquidityUsd)}</b><span>liquidity, all pools</span></div>
                    <div><b>{usd(report.market.volume24hUsd)}</b><span>24h DEX volume, all pools</span></div>
                    <div><b>{report.market.holders !== undefined ? compact(report.market.holders) : "?"}</b><span>holders</span></div>
                    <div><b>{report.market.top10HolderShare !== undefined ? `${Math.round(report.market.top10HolderShare * 100)}%` : "?"}</b><span>held by top 10</span></div>
                  </div>
                  <p className="fine">Totals across {report.market.pools} pool{report.market.pools === 1 ? "" : "s"}, so a single pair page (like LOFI/SUI on Cetus) shows less{report.market.mainPool && <> · main pool on {report.market.mainPool.dex}</>}{report.market.ageDays !== undefined && <> · {age(report.market.ageDays)} old</>}</p>
                  {report.market.cexVolume24hUsd !== undefined && report.market.totalVolume24hUsd ? (
                    <p className="fine cex">
                      24h volume everywhere: {usd(report.market.totalVolume24hUsd)}. Sui DEXes {usd(report.market.volume24hUsd)} · centralised exchanges {usd(report.market.cexVolume24hUsd)}
                      {" "}({Math.round((report.market.cexVolume24hUsd / report.market.totalVolume24hUsd) * 100)}%), which happens off-chain and can't be checked, so it isn't scored.
                    </p>
                  ) : (
                    <p className="fine">Onchain Sui DEX trading only. Sites like CoinGecko also count centralised exchanges, so their volume can be higher.</p>
                  )}
                </div>
              )}

              {report.swaps && (
                <div className="panel">
                  <h3>Who's trading it</h3>
                  <div className="stats">
                    <div><b>{report.swaps.swaps}</b><span>recent swaps</span></div>
                    <div><b>{report.swaps.traders}</b><span>wallets</span></div>
                    <div><b>{report.swaps.roundTrippers}</b><span>bought and sold</span></div>
                    <div><b>{Math.round(report.swaps.washShare * 100)}%</b><span>swaps by wash bots</span></div>
                  </div>
                  <div className="bar" title="Share of swaps by the 10 busiest wallets"><span style={{ width: `${Math.round(report.swaps.topTraderShare * 100)}%` }} /></div>
                  <p className="fine">{Math.round(report.swaps.topTraderShare * 100)}% of swaps by the 10 busiest wallets · {Math.round(report.swaps.repeatSizeShare * 100)}% by bots of any kind · {report.swaps.pools} pool{report.swaps.pools === 1 ? "" : "s"}{report.swaps.hoursCovered >= 1 ? `, last ${Math.round(report.swaps.hoursCovered)}h` : ""}</p>
                </div>
              )}

              {report.social && (
                <div className="panel">
                  <h3>X, last 7 days</h3>
                  <div className="stats">
                    <div><b>{report.social.posts}</b><span>posts tagging it</span></div>
                    <div><b>{report.social.uniqueAuthors}</b><span>accounts</span></div>
                    <div><b>{Math.round(report.social.duplicateShare * 100)}%</b><span>copy-paste</span></div>
                  </div>
                  {report.postsFound !== undefined && report.postsFound > (report.postsTagging ?? 0) && (
                    <p className="fine">X returned {report.postsFound} posts. {report.postsTagging} actually tag the project and are counted.</p>
                  )}
                </div>
              )}

              {(report.verdict.flags.length > 0 || report.verdict.positives.length > 0) && (
                <div className="panel wide signals">
                  {report.verdict.flags.length > 0 && <div><h3>Red flags</h3><ul className="list bad">{report.verdict.flags.map((f) => <li key={f}>{f}</li>)}</ul></div>}
                  {report.verdict.positives.length > 0 && <div><h3>Good signs</h3><ul className="list good">{report.verdict.positives.map((f) => <li key={f}>{f}</li>)}</ul></div>}
                </div>
              )}

              {report.social && report.social.accounts.length > 0 && <WhoIsPosting social={report.social} />}

              <div className="panel wide record">
                <h3>On the record</h3>
                {report.onchain?.txDigest ? (
                  <p>
                    This verdict is frozen on Sui {report.onchain.network} and can't be edited.{" "}
                    <a href={`https://suiscan.xyz/${report.onchain.network}/tx/${report.onchain.txDigest}`} target="_blank" rel="noreferrer">View the Sui transaction</a>
                    {report.onchain.walrusUrl
                      ? <> · <a href={report.onchain.walrusUrl} target="_blank" rel="noreferrer">Full report on Walrus</a></>
                      : <span className="muted"> Walrus storage was busy, so the full report wasn't stored this time.</span>}
                  </p>
                ) : report.onchain?.error ? (
                  <p className="muted">This scan couldn't be recorded on Sui this time. The result above is still complete.</p>
                ) : writing ? (
                  <p className="muted">Recording on Walrus and Sui…</p>
                ) : report.mock ? (
                  <p className="muted">Live scans are stored on Walrus and recorded on Sui by the yeti_scout Move package.</p>
                ) : (
                  <p className="muted">Not recorded on Sui for this scan.</p>
                )}
              </div>
            </div>
          </section>
  );
}
