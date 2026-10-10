from app.analysis.decoder import decode
from app.analysis.symbolic_executor import run_symbolic, SymbolicConfig
from asm import asm
import fixtures as F


def sym(code, **kw):
    return run_symbolic(decode(code), code, SymbolicConfig(**kw))


def test_vulnerable_has_satisfiable_call_then_sstore_path():
    r = sym(F.VULNERABLE)
    assert r["status"] == "complete_within_model"
    assert [(p["call_offset"], p["sstore_offset"]) for p in r["call_then_sstore_paths"]]
    assert r["call_then_sstore_paths"][0]["status"] == "satisfiable_modeled_path"
    assert r["call_value_feasibility"]


def test_safe_has_no_call_then_sstore():
    assert sym(F.SAFE)["call_then_sstore_paths"] == []


def test_unsat_branch_pruned():
    # x==1 && x==2 is infeasible: SSTORE guarded by contradictory branches is never reached
    code = asm("""
    PUSH1 0; CALLDATALOAD; DUP1; PUSH1 1; EQ; PUSH2 @a; JUMPI; STOP
    a: JUMPDEST; DUP1; PUSH1 2; EQ; PUSH2 @b; JUMPI; STOP
    b: JUMPDEST; PUSH1 1; PUSH1 1; SSTORE; STOP""")
    r = sym(code)
    assert r["status"] == "complete_within_model"
    assert r["terminations"] == {"halt:STOP": 2}  # only the two feasible paths ran
    assert r["steps"] == 15  # block b (the SSTORE) was never entered


def test_unsupported_semantics_makes_incomplete():
    r = sym(asm("PUSH1 0; PUSH1 0; PUSH1 0; CALLDATACOPY; STOP"))
    assert r["status"] == "incomplete" and r["unsupported_opcodes"] == {"CALLDATACOPY": 1}


def test_symbolic_jump_unsupported():
    r = sym(asm("PUSH1 0; CALLDATALOAD; JUMP"))
    assert r["status"] == "incomplete" and "unsupported:symbolic_jump_target" in r["terminations"]


def test_loop_bound():
    r = sym(asm("l: JUMPDEST; PUSH2 @l; JUMP"), max_jumpdest_visits=3)
    assert r["status"] == "incomplete" and r["terminations"] == {"limit:loop_bound": 1}


def test_depth_limit_and_step_budget():
    assert "limit:depth_limit" in sym(asm("l: JUMPDEST; PUSH2 @l; JUMP"), max_jumpdest_visits=10**6, max_depth=50)["terminations"]
    r = sym(asm("l: JUMPDEST; PUSH2 @l; JUMP"), max_jumpdest_visits=10**6, max_steps=30)
    assert r["status"] == "incomplete" and "limit:step_budget" in r["terminations"]


def test_path_explosion_limit():
    # chain of independent calldata branches -> 2^n paths; limit must trigger
    body = "".join(f"PUSH1 {i}; CALLDATALOAD; PUSH2 @n{i}; JUMPI; n{i}: JUMPDEST;" for i in range(12))
    r = sym(asm(body + "STOP"), max_paths=8)
    assert r["status"] == "incomplete" and "limit:path_limit" in r["terminations"]


def test_cancellation():
    r = run_symbolic(decode(F.VULNERABLE), F.VULNERABLE, SymbolicConfig(), cancel=lambda: True)
    assert r["status"] == "cancelled"


def test_exceptional_halts():
    assert sym(asm("ADD"))["terminations"] == {"exceptional:stack_underflow": 1}
    assert sym(asm("PUSH1 1; JUMP"))["terminations"] == {"exceptional:invalid_jump": 1}
    assert "exceptional:invalid_opcode:UNKNOWN_0x0c" in sym(bytes.fromhex("0c"))["terminations"]


def test_arithmetic_semantics_against_python():
    # (2^256-1) + 1 wraps to 0 -> ISZERO gives 1 -> JUMPI taken concretely, so no fork and only one path
    code = asm("PUSH1 1; PUSH32 0x" + "ff" * 32 + "; ADD; ISZERO; PUSH2 @ok; JUMPI; INVALID; ok: JUMPDEST; STOP")
    r = sym(code)
    assert r["terminations"] == {"halt:STOP": 1}
    # DIV by zero == 0, SHL by >=256 == 0, SAR sign fill
    code = asm("PUSH1 0; PUSH1 5; DIV; PUSH2 @ok; JUMPI; PUSH1 1; PUSH2 256; SHL; PUSH2 @ok; JUMPI; STOP; ok: JUMPDEST; INVALID")
    assert sym(code)["terminations"] == {"halt:STOP": 1}


def test_memory_and_storage_roundtrip_concrete():
    code = asm("PUSH2 0xbeef; PUSH1 0x40; MSTORE; PUSH1 0x40; MLOAD; PUSH2 0xbeef; EQ; PUSH2 @ok; JUMPI; INVALID; ok: JUMPDEST; STOP")
    assert sym(code)["terminations"] == {"halt:STOP": 1}


def test_keccak_concrete_size_supported_symbolic_unsupported():
    assert sym(asm("PUSH1 32; PUSH1 0; KECCAK256; POP; STOP"))["terminations"] == {"halt:STOP": 1}
    r = sym(asm("PUSH1 0; CALLDATALOAD; PUSH1 0; KECCAK256; POP; STOP"))
    assert "unsupported:KECCAK256_symbolic_or_large_size" in r["terminations"]
