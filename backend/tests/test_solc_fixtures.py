"""Characterization tests on real solc 0.8.26 (cancun) runtime bytecode built from contracts/samples/*.sol.

They pin CURRENT behaviour including known false positives/negatives so regressions and improvements are visible.
They are not accuracy claims: three tiny contracts are not a benchmark.
"""
import pathlib
import pytest
from app.analysis.decoder import decode
from app.analysis.pipeline import analyze

FX = pathlib.Path(__file__).resolve().parents[2] / "tests" / "fixtures"
load = lambda n: (FX / f"{n}.hex").read_text().strip()


def summary(name):
    r = analyze(load(name))
    return r, [(f["severity"], f["classification"], f["solver_status"]) for f in r["findings"]]


def test_vulnerable_optimized_detected():
    r, f = summary("VulnerableBank.opt1")
    assert f == [("medium", "evidence_backed_potential", "satisfiable_modeled_path")]
    assert r["status"] == "completed_with_limitations"


@pytest.mark.parametrize("name", ["SafeBank.opt0", "SafeBank.opt1"])
def test_cei_ordering_no_finding(name):
    assert summary(name)[1] == []


def test_KNOWN_LIMITATION_unoptimized_build_only_inconclusive():
    # Internal-function returns are dynamic jumps -> CALL not reachable via resolved edges -> 'inconclusive'.
    # The solver independently reaches the call-then-SSTORE path, so the evidence is not lost.
    r, f = summary("VulnerableBank.opt0")
    assert f == [("low", "inconclusive", "satisfiable_modeled_path")]
    assert len(r["coverage"]["structure"]["unresolved_dynamic_jumps"]) > 0


def test_KNOWN_FALSE_POSITIVE_reentrancy_guard_not_recognised():
    _, f = summary("GuardedBank.opt1")
    assert f and f[0][0] == "high"  # guard (lock) is not modelled; documented in limitations.md


def test_symbolic_incomplete_due_to_unmodelled_returndatacopy():
    r = analyze(load("VulnerableBank.opt1"))
    assert r["symbolic_execution"]["status"] == "incomplete"
    assert r["symbolic_execution"]["unsupported_opcodes"] == {"RETURNDATACOPY": 1}


def test_metadata_tail_reported_not_hidden():
    r = analyze(load("SafeBank.opt1"))
    assert r["coverage"]["decoding"]["unknown_opcodes"] + r["coverage"]["decoding"]["truncated_push"] >= 1


@pytest.mark.parametrize("name", ["VulnerableBank.opt0", "VulnerableBank.opt1", "SafeBank.opt1", "GuardedBank.opt0"])
def test_decoder_matches_reference_disassembler(name):
    pyevmasm = pytest.importorskip("pyevmasm")
    code = bytes.fromhex(load(name))
    ref = {i.pc: (i.name, i.size) for i in pyevmasm.disassemble_all(code)}
    norm = {"SHA3": "KECCAK256"}
    for i in decode(code, "cancun").instructions:
        if i.status != "valid" or i.mnemonic == "PUSH0":  # reference lacks PUSH0 / prints INVALID for unknown
            continue
        assert i.offset in ref, hex(i.offset)
        assert (norm.get(ref[i.offset][0], ref[i.offset][0]), ref[i.offset][1]) == (i.mnemonic, i.size)
