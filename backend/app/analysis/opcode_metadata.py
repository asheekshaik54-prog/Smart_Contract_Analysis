"""EVM opcode metadata with per-revision availability.

Source of truth for decoding. Gas costs are intentionally NOT modelled.
Only opcodes listed here are "known"; everything else is reported as unknown.
"""
from __future__ import annotations

from dataclasses import dataclass

REVISIONS = ("homestead", "byzantium", "constantinople", "istanbul", "berlin",
             "london", "paris", "shanghai", "cancun")
DEFAULT_REVISION = "cancun"


def revision_index(rev: str) -> int:
    try:
        return REVISIONS.index(rev)
    except ValueError:
        raise ValueError(f"Unsupported EVM revision {rev!r}; supported: {', '.join(REVISIONS)}")


@dataclass(frozen=True)
class OpInfo:
    code: int
    name: str
    pops: int
    pushes: int
    since: str = "homestead"
    imm: int = 0  # immediate bytes (PUSHn)
    terminal: bool = False  # halts execution of the frame


_T: dict[int, OpInfo] = {}


def _add(code, name, pops, pushes, since="homestead", imm=0, terminal=False):
    _T[code] = OpInfo(code, name, pops, pushes, since, imm, terminal)


for c, n, p, q in [
    (0x01, "ADD", 2, 1), (0x02, "MUL", 2, 1), (0x03, "SUB", 2, 1), (0x04, "DIV", 2, 1),
    (0x05, "SDIV", 2, 1), (0x06, "MOD", 2, 1), (0x07, "SMOD", 2, 1), (0x08, "ADDMOD", 3, 1),
    (0x09, "MULMOD", 3, 1), (0x0A, "EXP", 2, 1), (0x0B, "SIGNEXTEND", 2, 1),
    (0x10, "LT", 2, 1), (0x11, "GT", 2, 1), (0x12, "SLT", 2, 1), (0x13, "SGT", 2, 1),
    (0x14, "EQ", 2, 1), (0x15, "ISZERO", 1, 1), (0x16, "AND", 2, 1), (0x17, "OR", 2, 1),
    (0x18, "XOR", 2, 1), (0x19, "NOT", 1, 1), (0x1A, "BYTE", 2, 1),
    (0x20, "KECCAK256", 2, 1),
    (0x30, "ADDRESS", 0, 1), (0x31, "BALANCE", 1, 1), (0x32, "ORIGIN", 0, 1), (0x33, "CALLER", 0, 1),
    (0x34, "CALLVALUE", 0, 1), (0x35, "CALLDATALOAD", 1, 1), (0x36, "CALLDATASIZE", 0, 1),
    (0x37, "CALLDATACOPY", 3, 0), (0x38, "CODESIZE", 0, 1), (0x39, "CODECOPY", 3, 0),
    (0x3A, "GASPRICE", 0, 1), (0x3B, "EXTCODESIZE", 1, 1), (0x3C, "EXTCODECOPY", 4, 0),
    (0x40, "BLOCKHASH", 1, 1), (0x41, "COINBASE", 0, 1), (0x42, "TIMESTAMP", 0, 1),
    (0x43, "NUMBER", 0, 1), (0x44, "PREVRANDAO", 0, 1), (0x45, "GASLIMIT", 0, 1),
    (0x50, "POP", 1, 0), (0x51, "MLOAD", 1, 1), (0x52, "MSTORE", 2, 0), (0x53, "MSTORE8", 2, 0),
    (0x54, "SLOAD", 1, 1), (0x55, "SSTORE", 2, 0), (0x56, "JUMP", 1, 0), (0x57, "JUMPI", 2, 0),
    (0x58, "PC", 0, 1), (0x59, "MSIZE", 0, 1), (0x5A, "GAS", 0, 1), (0x5B, "JUMPDEST", 0, 0),
    (0xF0, "CREATE", 3, 1), (0xF1, "CALL", 7, 1), (0xF2, "CALLCODE", 7, 1),
    (0xF4, "DELEGATECALL", 6, 1),
]:
    _add(c, n, p, q)

_add(0x00, "STOP", 0, 0, terminal=True)
_add(0xF3, "RETURN", 2, 0, terminal=True)
_add(0xFF, "SELFDESTRUCT", 1, 0, terminal=True)
for c, n, p, q, s in [
    (0x1B, "SHL", 2, 1, "constantinople"), (0x1C, "SHR", 2, 1, "constantinople"),
    (0x1D, "SAR", 2, 1, "constantinople"), (0x3F, "EXTCODEHASH", 1, 1, "constantinople"),
    (0xF5, "CREATE2", 4, 1, "constantinople"),
    (0x3D, "RETURNDATASIZE", 0, 1, "byzantium"), (0x3E, "RETURNDATACOPY", 3, 0, "byzantium"),
    (0xFA, "STATICCALL", 6, 1, "byzantium"),
    (0x46, "CHAINID", 0, 1, "istanbul"), (0x47, "SELFBALANCE", 0, 1, "istanbul"),
    (0x48, "BASEFEE", 0, 1, "london"), (0x5F, "PUSH0", 0, 1, "shanghai"),
    (0x49, "BLOBHASH", 1, 1, "cancun"), (0x4A, "BLOBBASEFEE", 0, 1, "cancun"),
    (0x5C, "TLOAD", 1, 1, "cancun"), (0x5D, "TSTORE", 2, 0, "cancun"), (0x5E, "MCOPY", 3, 0, "cancun"),
]:
    _add(c, n, p, q, s)
_add(0xFD, "REVERT", 2, 0, "byzantium", terminal=True)
_add(0xFE, "INVALID", 0, 0, terminal=True)

for i in range(32):
    _add(0x60 + i, f"PUSH{i + 1}", 0, 1, imm=i + 1)
for i in range(16):
    _add(0x80 + i, f"DUP{i + 1}", i + 1, i + 2)
    _add(0x90 + i, f"SWAP{i + 1}", i + 2, i + 2)
for i in range(5):
    _add(0xA0 + i, f"LOG{i}", 2 + i, 0)

OPCODES: dict[int, OpInfo] = dict(_T)
BY_NAME: dict[str, OpInfo] = {o.name: o for o in OPCODES.values()}

EXTERNAL_CALLS = {"CALL", "CALLCODE", "DELEGATECALL", "STATICCALL"}


def is_available(info: OpInfo, revision: str) -> bool:
    return revision_index(info.since) <= revision_index(revision)
