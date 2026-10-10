import pytest
from app.analysis.validator import normalize_bytecode, ValidationError
from app.analysis.decoder import decode, VALID, UNKNOWN, TRUNCATED, NOT_IN_REVISION
from app.analysis.cfg import build_cfg
from asm import asm


@pytest.mark.parametrize("raw,code", [("", "empty"), ("0x", "empty"), ("   ", "empty"), ("abc", "odd_length"),
                                      ("0xzz", "invalid_hex"), ("60  01", "invalid_hex")])
def test_validation_rejects(raw, code):
    with pytest.raises(ValidationError) as e:
        normalize_bytecode(raw)
    assert e.value.code == code


def test_validation_size_limit_and_normalization():
    with pytest.raises(ValidationError) as e:
        normalize_bytecode("00" * 11, max_bytes=10)
    assert e.value.code == "too_large"
    n = normalize_bytecode("  0X60AB ")
    assert n.hex == "60ab" and n.data == b"\x60\xab" and n.size == 2
    assert len(n.sha256) == 64


def test_offsets_and_push_immediates():
    d = decode(bytes.fromhex("6001" "7f" + "5b" * 32 + "5b"))
    assert [(i.offset, i.mnemonic) for i in d.instructions] == [(0, "PUSH1"), (2, "PUSH32"), (35, "JUMPDEST")]
    assert d.instructions[1].size == 33
    assert d.valid_jumpdests == frozenset({35})  # 0x5b inside PUSH data is not a JUMPDEST


def test_truncated_push():
    d = decode(bytes.fromhex("6001" "61ff"))
    assert d.instructions[-1].status == TRUNCATED and d.instructions[-1].immediate == "ff"


def test_unknown_and_revision():
    d = decode(bytes.fromhex("0c"))
    assert d.instructions[0].status == UNKNOWN
    assert decode(bytes.fromhex("5f"), "cancun").instructions[0].status == VALID
    assert decode(bytes.fromhex("5f"), "london").instructions[0].status == NOT_IN_REVISION
    assert decode(bytes.fromhex("5c"), "shanghai").instructions[0].status == NOT_IN_REVISION
    with pytest.raises(ValueError):
        decode(b"\x00", "nope")


def test_cfg_jump_and_jumpi():
    code = asm("""PUSH1 1; PUSH2 @a; JUMPI; PUSH2 @b; JUMP; a: JUMPDEST; STOP; b: JUMPDEST; STOP""")
    c = build_cfg(decode(code))
    kinds = sorted(e.kind for e in c.edges)
    assert kinds == ["jump", "jumpi_false", "jumpi_true"]
    assert c.unresolved_jumps == []
    assert len(c.reachable_from_entry()) == len(c.blocks)


def test_cfg_dynamic_and_invalid_jump():
    c = build_cfg(decode(asm("PUSH1 0; CALLDATALOAD; JUMP")))
    assert c.unresolved_jumps == [3]
    c = build_cfg(decode(asm("PUSH1 0x01; JUMP; STOP")))  # 1 is not a JUMPDEST
    assert c.invalid_jump_targets == [(2, 1)] and c.unresolved_jumps == []


def test_cfg_dup_swap_resolution():
    c = build_cfg(decode(asm("PUSH2 @a; PUSH1 0; SWAP1; JUMP; a: JUMPDEST; STOP")))
    assert [e.kind for e in c.edges] == ["jump"]
