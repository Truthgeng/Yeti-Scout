"use client";

import { useEffect, useRef, useState } from "react";
import type { WalletAccount } from "@mysten/wallet-standard";
import type { Report } from "@/lib/types";
import { ReportView, LOFI, BUY_LOFI, compact, short, walletMessage } from "./report-view";
import { signInMessage } from "@/lib/sign-in";
import { connect as connectWallet, disconnect as disconnectWallet, signMessage, watchWallets, type SuiWallet } from "@/lib/sui-wallets";
import { TrailCanvas } from "./trail";
import { Progress, RecentFeed } from "./extras";

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
  const [stages, setStages] = useState<Record<string, "done" | "failed">>({});
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
    setStages({});
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 240_000);
      const res = await fetch("/api/check", {
        signal: ctrl.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, coinType: coin }),
      }).finally(() => clearTimeout(timer));
      // Gate refusals come back as plain JSON; a scan that started streams its progress
      if (!(res.headers.get("content-type") ?? "").includes("ndjson")) {
        const data = await res.json();
        if (data.needsLofi && config) setConfig({ ...config, freeLeft: 0 });
        throw new Error(data.error || "Something went wrong.");
      }
      let data: Report | null = null;
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "stage") setStages((cur) => ({ ...cur, [msg.stage]: msg.ok ? "done" : "failed" }));
          else if (msg.type === "done") data = msg.report;
          else if (msg.type === "error") {
            if (msg.refund !== undefined) await fetch("/api/free", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cookie: msg.refund }) }).catch(() => {});
            throw new Error(msg.error);
          }
        }
      }
      if (!data) throw new Error("The scan lost its connection. It didn't count. Try again.");
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
            {busy && <Progress stages={stages} coin={!!coin.trim()} handle={!!handle.trim()} />}
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

        {report && <ReportView report={report} writing={writing} resultRef={resultRef} />}

        <RecentFeed refreshKey={report?.onchain?.txDigest} />

        <footer className="foot">
          Built for CLAY Hackathon III on Sui. Not financial advice: a clean sniff test doesn't make a token safe.
        </footer>
      </main>
    </>
  );
}
