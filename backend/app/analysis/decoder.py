"""Opcode decoder. PUSH immediates are never decoded as instructions."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

from .opcode_metadata import DEFAULT_REVISION, OPCODES, is_available, revision_index

VALID = "valid"
UNKNOWN = "unknown_opcode"
NOT_IN_REVISION = "unavailable_in_revision"  # known opcode, behaves as INVALID in the chosen revision
TRUNCATED = "truncated_push"


@dataclass(frozen=True)
class Instruction:
    offset: int
    opcode: int
    mnemonic: str
    size: int
    immediate: str  # hex, "" when none
    status: str

    @property
    def imm_int(self) -> Optional[int]:
        return int(self.immediate, 16) if self.immediate else None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class DecodeResult:
    revision: str
    instructions: tuple[Instruction, ...]

    @property
    def valid_jumpdests(self) -> frozenset[int]:
        return frozenset(i.offset for i in self.instructions
                         if i.mnemonic == "JUMPDEST" and i.status == VALID)

    @property
    def by_offset(self) -> dict[int, Instruction]:
        return {i.offset: i for i in self.instructions}


def decode(code: bytes, revision: str = DEFAULT_REVISION) -> DecodeResult:
    revision_index(revision)  # validates
    out: list[Instruction] = []
    pc, n = 0, len(code)
    while pc < n:
        op = code[pc]
        info = OPCODES.get(op)
        if info is None:
            out.append(Instruction(pc, op, f"UNKNOWN_0x{op:02x}", 1, "", UNKNOWN))
            pc += 1
            continue
        status = VALID if is_available(info, revision) else NOT_IN_REVISION
        if info.imm:
            avail = code[pc + 1: pc + 1 + info.imm]
            if len(avail) < info.imm:
                out.append(Instruction(pc, op, info.name, 1 + len(avail), avail.hex(), TRUNCATED))
                pc = n
                continue
            out.append(Instruction(pc, op, info.name, 1 + info.imm, avail.hex(), status))
            pc += 1 + info.imm
        else:
            out.append(Instruction(pc, op, info.name, 1, "", status))
            pc += 1
    return DecodeResult(revision, tuple(out))
