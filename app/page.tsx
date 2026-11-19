"use client";

import { useEffect, useRef, useState } from "react";
import type { WalletAccount } from "@mysten/wallet-standard";
import type { AccountTier, Report } from "@/lib/types";
import { signInMessage } from "@/lib/sign-in";
import { connect as connectWallet, disconnect as disconnectWallet, signMessage, watchWallets, type SuiWallet } from "@/lib/sui-wallets";
import { TrailCanvas } from "./trail";

type Config = {
  mode: "demo" | "test" | "live";
  gated: boolean;
  freeChecks: number;
  freeLeft: number | null;
  holdUsd: number;
  holderDailyScans: number;
  lofiNeeded?: number;
  lofiCoinType: string;
  publishing: boolean;
  publishNetwork: "mainnet" | "testnet";
};

type Holder = { signedIn: boolean; address?: string; lofi?: number; needed?: number; holds?: boolean | null; scansLeft?: number };

const LOFI = "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI";
const BUY_LOFI = `https://app.cetus.zone/swap/?from=0x2::sui::SUI&to=${LOFI}`;

const TIERS: { key: AccountTier; label: string; hint: string }[] = [
  { key: "established", label: "Established", hint: "1k+ followers, over a year old" },
  { key: "regular", label: "Regular", hint: "200+ followers, over 3 months old" },
  { key: "new", label: "New or tiny", hint: "under 3 months old or under 200 followers" },
  { key: "fake", label: "Likely fake", hint: "default picture, or brand new with no followers" },
];

const compact = (n?: number) =>
  n === undefined ? "?" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n));
const usd = (n?: number) => (n === undefined ? "?" : `$${compact(n)}`);
const age = (d?: number) => (d === undefined ? "?" : d < 60 ? `${d}d` : d < 730 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const tone = (s: number) => (s >= 65 ? "good" : s >= 40 ? "mid" : "bad");

function walletMessage(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/reject|denied|cancel|declin|closed/.test(m)) return "Cancelled in the wallet.";
  return `Couldn't connect: ${err instanceof Error ? err.message : String(err)}`.slice(0, 180);
}

function shareUrl(r: Report) {
  const who = r.market?.symbol ? `$${r.market.symbol}` : r.input.handle ? `@${r.input.handle}` : "this token";
  const text = `Ran ${who} through Yeti Scout.\n\n${r.verdict.score}/100. ${r.verdict.label}.\n\nSniff any Sui token before you ape:`;
  const url = typeof window !== "undefined" ? window.location.origin : "";
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

export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [holder, setHolder] = useState<Holder>({ signedIn: false });
  const [wallets, setWallets] = useState<SuiWallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<SuiWallet | null>(null);
  const [picker, setPicker] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [handle, setHandle] = useState("");
  const [coin, setCoin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [writing, setWriting] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    loadConfig();
    fetch("/api/gate", { cache: "no-store" }).then((r) => r.json()).then(setHolder).catch(() => {});
    return watchWallets(setWallets);
  }, []);

  function loadConfig() {
    fetch("/api/config", { cache: "no-store" }).then((r) => r.json()).then(setConfig).catch(() => {});
  }

  const isHolder = holder.signedIn && holder.holds === true;
  const outOfFree = !!config?.gated && !isHolder && (config.freeLeft ?? 0) === 0;

  function openPicker() {
    setError("");
    if (wallets.length === 1) return signIn(wallets[0]);
    if (wallets.length === 0) return setError("No Sui wallet found in this browser. Install Phantom or Slush, turn on Sui, then reload.");
    setPicker(true);
  }

  async function signIn(w: SuiWallet) {
    setPicker(false);
    setConnecting(true);
    setError("");
    try {
      const account: WalletAccount = await connectWallet(w);
      const issuedAt = new Date().toISOString();
      const signature = await signMessage(w, account, signInMessage(account.address, issuedAt, window.location.host));
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account.address, issuedAt, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign-in failed.");
      setActiveWallet(w);
      setHolder({ signedIn: true, ...data });
    } catch (e) {
      setError(walletMessage(e));
    } finally {
      setConnecting(false);
    }
  }

  async function signOut() {
    if (activeWallet) await disconnectWallet(activeWallet);
    await fetch("/api/gate", { method: "DELETE" }).catch(() => {});
    setActiveWallet(null);
    setHolder({ signedIn: false });
  }

  async function run() {
    setError("");
    if (outOfFree) return openPicker();
    setBusy(true);
    setReport(null);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 240_000);
      const res = await fetch("/api/check", {
        signal: ctrl.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, coinType: coin }),
      }).finally(() => clearTimeout(timer));
      const data = await res.json();
      if (data.needsLofi && config) setConfig({ ...config, freeLeft: 0 });
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setReport(data);
      loadConfig();
      if (holder.signedIn) fetch("/api/gate", { cache: "no-store" }).then((r) => r.json()).then(setHolder).catch(() => {});
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      if (data.summaryToken) finish(data);
    } catch (e: any) {
      const aborted = e?.name === "AbortError";
      setError(aborted ? "The scan lost its connection, often because the screen locked. It didn't count. Keep this tab open and try again." : e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /** Step two: the agent writes its own read, then the report is recorded on Walrus and Sui */
  async function finish(r: Report) {
    setWriting(true);
    try {
      const subject = [r.input.handle && `@${r.input.handle}`, r.input.coinType && (r.market?.symbol ? `$${r.market.symbol} (${r.input.coinType})` : r.input.coinType)].filter(Boolean).join(" / ");
      const { summaryToken, ...rest } = r;
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: summaryToken,
          input: { ...r.input, handle: r.input.handle },
          subject, social: r.social, market: r.market, swaps: r.swaps, score: r.verdict.score, report: rest,
        }),
      });
      if (!res.ok) return;
      const { verdict, paidCalls, onchain } = await res.json();
      setReport((cur) => (cur && cur.generatedAt === r.generatedAt ? { ...cur, verdict, onchain, paidCalls: [...cur.paidCalls, ...paidCalls] } : cur));
    } catch { /* the rule summary stays */ } finally {
      setWriting(false);
    }
  }

  const needed = holder.needed ?? config?.lofiNeeded;
  const buttonText = busy ? "Sniffing…" : connecting ? "Check your wallet…" : outOfFree ? "Connect a LOFI wallet to scan" : "Run the sniff test";

  return (
    <>
      <div className="glow" aria-hidden />
      <nav className="nav">
        <a className="brand" href="/"><img src="/logo.png" alt="" width={34} height={34} className="brand-logo" />Yeti Scout</a>
        <div className="nav-right">
          {config?.gated && !holder.signedIn && config.freeLeft !== null && <span className="pill hide-sm">{config.freeLeft} free scan{config.freeLeft === 1 ? "" : "s"} left</span>}
          {isHolder && <span className="pill good hide-sm">{holder.scansLeft} scans left today</span>}
          {holder.signedIn ? (
            <button className="btn small" onClick={signOut} title="Sign out">{short(holder.address ?? "")} ×</button>
          ) : (
            <button className="btn small" onClick={openPicker} disabled={connecting}>{connecting ? "Connecting…" : "Connect wallet"}</button>
          )}
        </div>
      </nav>

      {picker && (
        <div className="sheet-bg" onClick={() => setPicker(false)}>
          <div className="sheet" role="dialog" aria-label="Choose a Sui wallet" onClick={(e) => e.stopPropagation()}>
            <h3>Choose a Sui wallet</h3>
            <p className="muted">You'll sign one message. No transaction, nothing leaves your wallet.</p>
            {wallets.map((w) => (
              <button key={w.name} className="sheet-opt" onClick={() => signIn(w)}>
                {w.icon && <img src={w.icon} alt="" width={24} height={24} />}<b>{w.name}</b>
              </button>
            ))}
            <button className="ghost" onClick={() => setPicker(false)}>Cancel</button>
          </div>
        </div>
      )}

      <main className="wrap">
        <section className="hero">
          <div className="hero-copy">
            <h1>Run any Sui token through the sniff test.</h1>
            <p className="sub">Paste a coin type or an X handle. Yeti Scout reads who is really trading it on Sui and who is really posting about it, then tells you if the hype is real or farmed.</p>
          </div>

          <div className="panel form">
            {config?.mode === "demo" && <p className="banner">Demo mode. Results use sample data.</p>}
            {config?.mode === "test" && <p className="banner">Test mode. Real data, open to everyone.</p>}
            <label htmlFor="coin">Sui coin type</label>
            <input id="coin" placeholder="0x…::lofi::LOFI" value={coin} onChange={(e) => setCoin(e.target.value)} autoComplete="off" spellCheck={false} />
            <label htmlFor="handle">X handle <span className="muted">(optional if the token lists one)</span></label>
            <input id="handle" placeholder="@lofitheyeti" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="off" spellCheck={false} />
            <div className="form-row">
              <button className="btn primary" disabled={busy || connecting || (!outOfFree && !handle && !coin)} onClick={run}>{buttonText}</button>
              <button className="ghost" onClick={() => { setCoin(LOFI); setHandle(""); }}>Try it on $LOFI</button>
            </div>
            {busy && <p className="hint">Reading Sui swaps, DEX pools and X posts. Usually 20 to 40 seconds.</p>}
            {!busy && config?.gated && !isHolder && (
              <p className="hint">
                {config.freeLeft ? `${config.freeLeft} free scan${config.freeLeft === 1 ? "" : "s"} left, no wallet needed. ` : ""}
                Hold {needed ? `${compact(needed)} LOFI` : `$${config.holdUsd} of LOFI`} for {config.holderDailyScans} scans a day. <a href={BUY_LOFI} target="_blank" rel="noreferrer">Get LOFI</a>
              </p>
            )}
            {holder.signedIn && holder.holds === false && (
              <p className="hint warn">This wallet holds {compact(holder.lofi)} LOFI. You need {compact(holder.needed)} for holder scans. <a href={BUY_LOFI} target="_blank" rel="noreferrer">Get LOFI</a></p>
            )}
            {error && <p className="error">{error}</p>}
          </div>

          <div className="trail-band" aria-hidden><TrailCanvas /></div>
          <ul className="facts">
            <li><b>Swaps</b>read straight from Sui</li>
            <li><b>Pools</b>across every Sui DEX</li>
            <li><b>Posts</b>sorted real from fake</li>
            <li><b>Every verdict</b>recorded on Sui + Walrus</li>
          </ul>
        </section>

        {report && (
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
                  <a className="btn small" href={shareUrl(report)} target="_blank" rel="noreferrer">Share on X</a>
                </div>
              </div>

              {report.market && (
                <div className="panel">
                  <h3>Market</h3>
                  <div className="stats">
                    <div><b>{usd(report.market.liquidityUsd)}</b><span>liquidity</span></div>
                    <div><b>{usd(report.market.volume24hUsd)}</b><span>24h volume</span></div>
                    <div><b>{report.market.holders !== undefined ? compact(report.market.holders) : "?"}</b><span>holders</span></div>
                    <div><b>{report.market.top10HolderShare !== undefined ? `${Math.round(report.market.top10HolderShare * 100)}%` : "?"}</b><span>held by top 10</span></div>
                  </div>
                  <p className="fine">{report.market.pools} pool{report.market.pools === 1 ? "" : "s"}{report.market.mainPool && <> · main pool on {report.market.mainPool.dex}</>}{report.market.ageDays !== undefined && <> · {age(report.market.ageDays)} old</>}</p>
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
                    {report.onchain.walrusUrl && <> · <a href={report.onchain.walrusUrl} target="_blank" rel="noreferrer">Full report on Walrus</a></>}
                  </p>
                ) : report.onchain?.error ? (
                  <p className="muted">Recording on Sui failed this time ({report.onchain.error}). The scan itself is fine.</p>
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
        )}

        <footer className="foot">
          Built for CLAY Hackathon III on Sui. Not financial advice: a clean sniff test doesn't make a token safe.
        </footer>
      </main>
    </>
  );
}
