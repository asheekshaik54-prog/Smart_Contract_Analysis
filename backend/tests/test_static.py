from app.analysis.decoder import decode
from app.analysis.cfg import build_cfg
from app.analysis.static_reentrancy import analyze_reentrancy
import fixtures as F


def run(code):
    d = decode(code); c = build_cfg(d)
    return analyze_reentrancy(d, c) + (c,)


def test_vulnerable_pattern_flagged_high_strong_same_const_slot():
    fs, ev, sites, cfg = run(F.VULNERABLE)
    assert len(fs) == 1
    f = fs[0]
    assert f.rule_id == "REENT-001" and f.severity == "high" and f.evidence_strength == "strong"
    assert f.classification == "evidence_backed_potential"
    assert f.exploitability == "not_assessed" and f.solver_status == "not_run"
    assert {e.kind for e in ev} >= {"external_call", "storage_read", "storage_write", "cfg_path"}
    assert all(i in {e.id for e in ev} for i in f.evidence_ids)


def test_safe_ordering_not_flagged():
    assert run(F.SAFE)[0] == []


def test_call_without_storage_write_not_flagged():
    fs, _, sites, _ = run(F.CALL_ONLY)
    assert fs == [] and [x["mnemonic"] for x in sites] == ["CALL"]


def test_zero_value_call_is_informational():
    fs = run(F.ZERO_VALUE)[0]
    assert len(fs) == 1 and fs[0].severity == "informational" and fs[0].classification == "heuristic_warning"


def test_same_constant_slot_is_high_strong():
    fs = run(F.SAME_SLOT)[0]
    assert len(fs) == 1 and fs[0].severity == "high" and fs[0].evidence_strength == "strong"


def test_dynamic_jump_hides_sstore_and_is_reported():
    fs, _, _, cfg = run(F.DYNAMIC)
    assert fs == []  # known false negative: SSTORE behind unresolved jump
    assert len(cfg.unresolved_jumps) == 1


def test_unreachable_call_is_inconclusive():
    fs = run(F.UNREACHABLE)[0]
    assert len(fs) == 1 and fs[0].classification == "inconclusive"


def test_finding_ids_stable():
    assert run(F.VULNERABLE)[0][0].id == run(F.VULNERABLE)[0][0].id


def test_non_constant_slot_is_medium_moderate():
    fs = run(F.DIFF_SLOT)[0]
    assert len(fs) == 1 and fs[0].severity == "medium" and fs[0].evidence_strength == "moderate"
