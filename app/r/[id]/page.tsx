import type { Metadata } from "next";
import { readReport, publishNetwork, walrusUrl } from "@/lib/publish";
import type { Report } from "@/lib/types";
import { SharedReport } from "./shared";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(id)) return null;
  return readReport(id).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).id);
  if (!found) return { title: "Report not found · Yeti Scout" };
  const r = found.record;
  const who = r.symbol ? `$${r.symbol}` : r.handle ? `@${r.handle}` : "A Sui token";
  const title = `${who}: ${r.score}/100, ${r.verdict} · Yeti Scout`;
  const description = "Verdict frozen on Sui. See who's really trading and posting about it.";
  return { title, description, openGraph: { title, description, images: ["/logo-512.png"] }, twitter: { card: "summary", title, description, images: ["/logo-512.png"] } };
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const found = await load(id);
  const net = publishNetwork();
  if (!found) return <SharedReport notFound />;
  const { record, full } = found;
  const onchain = {
    network: net,
    reportId: id,
    txDigest: record.txDigest,
    ...(record.walrusBlobId ? { walrusBlobId: record.walrusBlobId, walrusUrl: walrusUrl(record.walrusBlobId) } : {}),
  };
  // The full report from Walrus when it's there; otherwise just what was frozen on Sui
  const report: Report = full && typeof full === "object" && (full as any).verdict
    ? { ...(full as Report), onchain, paidCalls: [], mock: false }
    : {
        input: { coinType: record.coinType || undefined, handle: record.handle || undefined },
        social: null, market: record.symbol ? ({ symbol: record.symbol } as any) : null, swaps: null,
        verdict: { score: record.score, label: record.verdict as any, summary: "The full report wasn't stored on Walrus for this scan, so only the verdict frozen on Sui is shown.", flags: [], positives: [] },
        paidCalls: [], onchain, mock: false, mode: "live", generatedAt: new Date(record.scannedAt).toISOString(),
      };
  return <SharedReport report={report} number={record.number} scannedAt={record.scannedAt} />;
}
