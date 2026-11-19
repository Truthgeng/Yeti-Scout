"use client";

import type { Report } from "@/lib/types";
import { ReportView } from "../../report-view";

export function SharedReport({ report, number, scannedAt, notFound }: { report?: Report; number?: number; scannedAt?: number; notFound?: boolean }) {
  return (
    <>
      <div className="glow" aria-hidden />
      <nav className="nav">
        <a className="brand" href="/"><img src="/logo.png" alt="" width={34} height={34} />Yeti Scout</a>
        <div className="nav-right"><a className="btn small primary" href="/">Sniff a token</a></div>
      </nav>
      <main className="wrap">
        {notFound || !report ? (
          <section className="shared-head">
            <h1 className="shared-title">No report here.</h1>
            <p className="sub">That address isn't a Yeti Scout report on Sui. <a href="/">Run a scan</a> instead.</p>
          </section>
        ) : (
          <>
            <section className="shared-head">
              <p className="muted">
                Report #{number} · scanned {scannedAt ? new Date(scannedAt).toUTCString().replace(" GMT", " UTC") : ""} · frozen on Sui {report.onchain?.network}
              </p>
            </section>
            <ReportView report={report} shared />
          </>
        )}
        <footer className="foot">Built for CLAY Hackathon III on Sui. Not financial advice: a clean sniff test doesn't make a token safe.</footer>
      </main>
    </>
  );
}
