/// Yeti Scout: a public, permanent record of every scan.
///
/// Each scan the Yeti Scout agent finishes becomes a frozen `ScoutReport` object
/// on Sui. Frozen objects can never be edited or deleted, so a verdict can't be
/// quietly changed after the fact. The full report (every signal behind the score)
/// lives on Walrus, and `walrus_blob_id` points to it.
module yeti_scout::report;

use std::string::String;
use sui::clock::Clock;
use sui::event;

const EScoreTooHigh: u64 = 0;

/// Held by the Yeti Scout server wallet. Only its holder can publish reports.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared counter, so every report gets a running number.
public struct Scout has key {
    id: UID,
    reports: u64,
}

/// One scan, frozen on publish.
public struct ScoutReport has key, store {
    id: UID,
    number: u64,
    /// Full Sui coin type that was scanned, empty for X-only scans
    coin_type: String,
    /// X handle that was scanned, empty for coin-only scans
    x_handle: String,
    symbol: String,
    /// 0 to 100, higher means more organic
    score: u8,
    /// "Passed the sniff test", "Smells a bit off", "Failed the sniff test" or "Not enough to sniff"
    verdict: String,
    walrus_blob_id: String,
    scanned_at_ms: u64,
}

public struct ReportPublished has copy, drop {
    report_id: ID,
    number: u64,
    coin_type: String,
    x_handle: String,
    symbol: String,
    score: u8,
    verdict: String,
    walrus_blob_id: String,
    scanned_at_ms: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(Scout { id: object::new(ctx), reports: 0 });
}

public fun publish(
    _: &AdminCap,
    scout: &mut Scout,
    coin_type: String,
    x_handle: String,
    symbol: String,
    score: u8,
    verdict: String,
    walrus_blob_id: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(score <= 100, EScoreTooHigh);
    scout.reports = scout.reports + 1;
    let report = ScoutReport {
        id: object::new(ctx),
        number: scout.reports,
        coin_type,
        x_handle,
        symbol,
        score,
        verdict,
        walrus_blob_id,
        scanned_at_ms: clock.timestamp_ms(),
    };
    event::emit(ReportPublished {
        report_id: object::id(&report),
        number: report.number,
        coin_type: report.coin_type,
        x_handle: report.x_handle,
        symbol: report.symbol,
        score,
        verdict: report.verdict,
        walrus_blob_id: report.walrus_blob_id,
        scanned_at_ms: report.scanned_at_ms,
    });
    transfer::public_freeze_object(report);
}

public fun reports(scout: &Scout): u64 { scout.reports }

public fun score(r: &ScoutReport): u8 { r.score }

public fun verdict(r: &ScoutReport): String { r.verdict }

public fun walrus_blob_id(r: &ScoutReport): String { r.walrus_blob_id }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
