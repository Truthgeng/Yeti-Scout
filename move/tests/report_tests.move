#[test_only, allow(deprecated_usage)]
module yeti_scout::report_tests;

use sui::clock;
use sui::test_scenario as ts;
use yeti_scout::report::{Self, AdminCap, Scout, ScoutReport};

const ADMIN: address = @0xA;

#[test]
fun publishes_a_frozen_report() {
    let mut s = ts::begin(ADMIN);
    report::init_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut scout = s.take_shared<Scout>();
    let clk = clock::create_for_testing(s.ctx());
    report::publish(
        &cap, &mut scout,
        b"0x2::sui::SUI".to_string(), b"lofitheyeti".to_string(), b"LOFI".to_string(),
        72, b"Passed the sniff test".to_string(), b"blob123".to_string(),
        &clk, s.ctx(),
    );
    assert!(report::reports(&scout) == 1);
    s.next_tx(ADMIN);
    let r = s.take_immutable<ScoutReport>();
    assert!(report::score(&r) == 72);
    ts::return_immutable(r);
    clock::destroy_for_testing(clk);
    ts::return_shared(scout);
    s.return_to_sender(cap);
    s.end();
}

#[test, expected_failure(abort_code = report::EScoreTooHigh)]
fun rejects_score_over_100() {
    let mut s = ts::begin(ADMIN);
    report::init_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut scout = s.take_shared<Scout>();
    let clk = clock::create_for_testing(s.ctx());
    report::publish(
        &cap, &mut scout,
        b"".to_string(), b"x".to_string(), b"".to_string(),
        101, b"".to_string(), b"".to_string(),
        &clk, s.ctx(),
    );
    abort 99
}
