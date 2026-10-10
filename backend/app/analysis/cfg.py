"""Control-flow reconstruction.

Jump targets are resolved only from constants visible INSIDE a basic block (intra-block
constant tracking). Anything else is reported as an unresolved dynamic jump - the CFG is
then an under-approximation of real control flow, and reachability results are lower bounds.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .decoder import DecodeResult, Instruction, VALID
from .opcode_metadata import OPCODES

TERMINATORS = {"STOP", "RETURN", "REVERT", "INVALID", "SELFDESTRUCT"}


@dataclass
class Edge:
    src: int  # block start
    dst: int
    kind: str  # fallthrough | jump | jumpi_true | jumpi_false


@dataclass
class Block:
    start: int
    instructions: list[Instruction]
    successors: list[Edge] = field(default_factory=list)
    unresolved_jump: bool = False
    invalid_jump_target: Optional[int] = None
    halts_invalid: bool = False  # ends in unknown/unavailable opcode (exceptional halt)

    @property
    def end(self) -> int:
        return self.instructions[-1].offset

    @property
    def last(self) -> Instruction:
        return self.instructions[-1]


@dataclass
class CFG:
    blocks: dict[int, Block]
    entry: int
    edges: list[Edge]
    unresolved_jumps: list[int]  # instruction offsets of JUMP/JUMPI with unresolved target
    invalid_jump_targets: list[tuple[int, int]]  # (jump offset, constant target)

    def block_of(self, offset: int) -> Optional[Block]:
        for b in self.blocks.values():
            if b.start <= offset <= b.end:
                return b
        return None

    def reachable_from_entry(self) -> set[int]:
        return _reach(self, [self.entry], forward=True)

    def predecessors(self) -> dict[int, list[int]]:
        p: dict[int, list[int]] = {s: [] for s in self.blocks}
        for e in self.edges:
            p[e.dst].append(e.src)
        return p


def _reach(cfg: CFG, starts, forward=True) -> set[int]:
    adj: dict[int, list[int]] = {s: [] for s in cfg.blocks}
    for e in cfg.edges:
        if forward:
            adj[e.src].append(e.dst)
        else:
            adj[e.dst].append(e.src)
    seen, stack = set(), list(starts)
    while stack:
        b = stack.pop()
        if b in seen or b not in adj:
            continue
        seen.add(b)
        stack.extend(adj[b])
    return seen


def trace_block_stack(block: Block):
    """Yield (instruction, stack_before) with an abstract stack of Optional[int] (None = unknown).

    Stack contents below the block entry are unknown (padded with None on demand). Top of stack is last.
    """
    stack: list[Optional[int]] = []

    def pop():
        return stack.pop() if stack else None

    for ins in block.instructions:
        yield ins, list(stack)
        info = OPCODES.get(ins.opcode)
        if info is None or ins.status != VALID:
            continue
        n = info.name
        if n.startswith("PUSH") and n != "PUSH0":
            stack.append(ins.imm_int)
        elif n == "PUSH0":
            stack.append(0)
        elif n.startswith("DUP"):
            k = int(n[3:])
            stack.append(stack[-k] if len(stack) >= k else None)
        elif n.startswith("SWAP"):
            k = int(n[4:])
            while len(stack) < k + 1:
                stack.insert(0, None)
            stack[-1], stack[-1 - k] = stack[-1 - k], stack[-1]
        else:
            for _ in range(info.pops):
                pop()
            stack.extend([None] * info.pushes)


def build_cfg(dec: DecodeResult) -> CFG:
    ins = list(dec.instructions)
    if not ins:
        return CFG({}, 0, [], [], [])
    jd = dec.valid_jumpdests
    leaders = {ins[0].offset} | set(jd)
    for i, x in enumerate(ins):
        if (x.mnemonic in TERMINATORS | {"JUMP", "JUMPI"} or x.status != VALID) and i + 1 < len(ins):
            leaders.add(ins[i + 1].offset)

    blocks: dict[int, Block] = {}
    cur: list[Instruction] = []
    for x in ins:
        if x.offset in leaders and cur:
            blocks[cur[0].offset] = Block(cur[0].offset, cur)
            cur = []
        cur.append(x)
    if cur:
        blocks[cur[0].offset] = Block(cur[0].offset, cur)

    starts = sorted(blocks)
    nxt = {s: (starts[i + 1] if i + 1 < len(starts) else None) for i, s in enumerate(starts)}
    edges: list[Edge] = []
    unresolved: list[int] = []
    invalid_targets: list[tuple[int, int]] = []

    for s in starts:
        b = blocks[s]
        last = b.last
        if last.status != VALID:
            b.halts_invalid = True
            continue
        if last.mnemonic in TERMINATORS:
            continue
        if last.mnemonic in ("JUMP", "JUMPI"):
            stack_before = None
            for x, st in trace_block_stack(b):
                if x is last:
                    stack_before = st
            target = stack_before[-1] if stack_before else None
            if target is None:
                b.unresolved_jump = True
                unresolved.append(last.offset)
            elif target in jd:
                kind = "jump" if last.mnemonic == "JUMP" else "jumpi_true"
                edges.append(Edge(s, target, kind))
            else:
                b.invalid_jump_target = target
                invalid_targets.append((last.offset, target))
            if last.mnemonic == "JUMPI" and nxt[s] is not None:
                edges.append(Edge(s, nxt[s], "jumpi_false"))
        elif nxt[s] is not None:
            edges.append(Edge(s, nxt[s], "fallthrough"))

    for e in edges:
        blocks[e.src].successors.append(e)
    return CFG(blocks, starts[0], edges, unresolved, invalid_targets)
