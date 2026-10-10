import json
from fastapi.testclient import TestClient
from app.api.main import app
from app.analysis.pipeline import analyze, compare, AnalysisConfig
import fixtures as F

c = TestClient(app)
V = "0x" + F.VULNERABLE.hex()
S = "0x" + F.SAFE.hex()


def test_end_to_end_vulnerable():
    r = analyze(V)
    assert r["status"] == "completed_with_limitations" or r["status"] == "completed"
    f = r["findings"][0]
    assert f["rule_id"] == "REENT-001" and f["solver_status"] == "satisfiable_modeled_path" and f["witness"]
    assert r["coverage"]["security_analysis"]["rules_executed"] == ["REENT-001"]
    assert r["coverage"]["security_analysis"]["symbolic_execution"] == "complete_within_model"
    json.dumps(r)  # serialisable


def test_safe_has_no_findings_but_no_safety_claim():
    r = analyze(S)
    assert r["findings"] == []
    assert any("does NOT mean the contract is secure" in l for l in r["limitations"])


def test_fingerprint_reproducible_and_config_sensitive():
    a, b = analyze(V), analyze(V)
    assert a["fingerprint"] == b["fingerprint"] and a["scan_id"] != b["scan_id"]
    d = analyze(V, AnalysisConfig(run_symbolic=False))
    assert d["fingerprint"]["input_fingerprint_sha256"] != a["fingerprint"]["input_fingerprint_sha256"]
    assert d["status"] == "completed_with_limitations" and "symbolic execution not run" in d["limitation_reasons"]
    e = analyze(V, AnalysisConfig(revision="london"))
    assert e["fingerprint"]["input_fingerprint_sha256"] != a["fingerprint"]["input_fingerprint_sha256"]


def test_compare_does_not_claim_fix():
    d = compare(V, S)
    assert d["findings"]["removed_rule_groups"] and not d["identical"]
    assert any("does NOT show the issue is fixed" in l for l in d["limitations"])
    assert compare(V, V)["identical"] is True


def test_api_health_ready_capabilities():
    assert c.get("/health").json()["status"] == "ok"
    assert c.get("/ready").json()["status"] == "ready"
    cap = c.get("/api/v1/capabilities").json()
    assert cap["persistence"] is False and cap["rules"] == ["REENT-001"]


def test_api_analyze_and_errors():
    r = c.post("/api/v1/analyze", json={"bytecode": V})
    assert r.status_code == 200 and r.json()["findings"][0]["rule_id"] == "REENT-001"
    assert "x-request-id" in r.headers
    for bad, code in [("", "empty"), ("0xzz", "invalid_hex"), ("0x123", "odd_length")]:
        r = c.post("/api/v1/analyze", json={"bytecode": bad})
        assert r.status_code == 422 and r.json()["error"]["code"] == code
    assert c.post("/api/v1/analyze", json={"bytecode": V, "evm_revision": "nope"}).status_code == 422
    assert c.post("/api/v1/analyze", json={"bytecode": "00" * 30000}).status_code == 422  # oversized
    assert c.post("/api/v1/analyze", json={"bytecode": V, "limits": {"max_steps": 10**9}}).status_code == 422
    assert c.post("/api/v1/analyze", json={}).status_code == 422


def test_api_compare():
    r = c.post("/api/v1/compare", json={"original": V, "updated": S})
    assert r.status_code == 200 and r.json()["findings"]["removed_rule_groups"]
