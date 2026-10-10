"""REENT-001: storage write reachable after an external CALL (checks-effects-interactions violation pattern).

See docs/analysis-methodology.md for the severity rubric. An external call alone never produces a finding.
"""
from __future__ import annotations

from collections import deque
from typing import Optional

from .cfg import CFG, trace_block_stack, _reach
from .decoder import DecodeResult, VALID
from .findings import Evidence, Finding, short_hash

RULE_ID = "REENT-001"
RULE_VERSION = "1.0.0"
RULE_SET_VERSION = "2026.10-r1"
MAX_LISTED_OFFSETS = 20

RULES = {RULE_ID: {
    "version": RULE_VERSION,
    "title": "State update reachable after external CALL",
    "description": "A CALL instruction is followed, on at least one resolved CFG path, by an SSTORE. "
                   "If the callee can re-enter before the SSTORE executes, state read before the call may be stale.",
    "opcodes": ["CALL", "SLOAD", "SSTORE"],
    "preconditions": ["Callee is attacker-controlled or can call back into this contract.",
                      "State written after the call influences a check performed before it."],
    "false_positives": ["Reentrancy guard implemented via storage lock set before the call.",
                        "Callee is a fixed trusted contract or a precompile.",
                        "Post-call SSTORE is unrelated to any pre-call check (e.g. event counters).",
                        "Call target is the contract itself or a view-only helper."],
    "limitations": ["Only CALL is considered; CALLCODE/DELEGATECALL/STATICCALL are listed in coverage, not analysed.",
                    "CFG omits edges through unresolved dynamic jumps; SSTOREs behind them are not seen (false negatives).",
                    "Storage slots are compared only when both are compile-time constants within one basic block.",
                    "Cross-function and cross-contract reentrancy are not modelled.",
                    "Call value is classified only when its value is a visible constant within the block."],
}}


def _bfs_block_path(cfg: CFG, src: int, dst: int) -> Optional[list[int]]:
    if src == dst:
        return [src]
    prev, q, seen = {}, deque([src]), {src}
    adj: dict[int, list[int]] = {}
    for e in cfg.edges:
        adj.setdefault(e.src, []).append(e.dst)
    while q:
        b = q.popleft()
        for n in adj.get(b, []):
            if n in seen:
                continue
            prev[n] = b
            if n == dst:
                path = [n]
                while path[-1] != src:
                    path.append(prev[path[-1]])
                return path[::-1]
            seen.add(n)
            q.append(n)
    return None


def analyze_reentrancy(dec: DecodeResult, cfg: CFG) -> tuple[list[Finding], list[Evidence], list[dict]]:
    """Returns (findings, evidence, external_call_sites)."""
    findings: list[Finding] = []
    evidence: dict[str, Evidence] = {}
    sites: list[dict] = []
    if not cfg.blocks:
        return findings, [], sites

    # per-instruction facts from intra-block tracing
    ins_block: dict[int, int] = {}
    call_value: dict[int, str] = {}
    slot_of: dict[int, Optional[int]] = {}
    for b in cfg.blocks.values():
        for ins, st in trace_block_stack(b):
            ins_block[ins.offset] = b.start
            if ins.status != VALID:
                continue
            if ins.mnemonic == "CALL":
                v = st[-3] if len(st) >= 3 else None
                call_value[ins.offset] = "zero" if v == 0 else ("nonzero_constant" if v is not None else "unknown")
            elif ins.mnemonic in ("SLOAD", "SSTORE"):
                slot_of[ins.offset] = st[-1] if st else None
            if ins.mnemonic in ("CALL", "CALLCODE", "DELEGATECALL", "STATICCALL"):
                sites.append({"offset": ins.offset, "mnemonic": ins.mnemonic})

    all_ins = [i for i in dec.instructions if i.status == VALID]
    sloads = [i.offset for i in all_ins if i.mnemonic == "SLOAD"]
    sstores = [i.offset for i in all_ins if i.mnemonic == "SSTORE"]
    from_entry = cfg.reachable_from_entry()
    preds = cfg.predecessors()

    def ev(kind, desc, offsets, data=None):
        e = Evidence("ev-" + short_hash(kind, *offsets, desc), kind, desc, list(offsets), data or {})
        evidence[e.id] = e
        return e.id

    for c in [i.offset for i in all_ins if i.mnemonic == "CALL"]:
        cb = ins_block[c]
        fwd = _reach(cfg, [e.dst for e in cfg.blocks[cb].successors], forward=True)
        # blocks that can reach cb (excluding cb itself unless on a cycle)
        back = _reach(cfg, preds[cb], forward=False)
        after = [s for s in sstores if (ins_block[s] == cb and s > c) or (ins_block[s] in fwd and ins_block[s] != cb)
                 or (ins_block[s] == cb and s < c and cb in fwd)]
        if not after:
            continue
        before = [s for s in sloads if (ins_block[s] == cb and s < c) or (ins_block[s] in back and ins_block[s] != cb)
                  or (ins_block[s] == cb and s > c and cb in back)]
        value = call_value.get(c, "unknown")
        same_slot = sorted({(l, s) for l in before for s in after
                            if slot_of.get(l) is not None and slot_of.get(l) == slot_of.get(s)})
        reachable = cb in from_entry

        if value == "zero":
            sev, strength, cls = "informational", "weak", "heuristic_warning"
        elif same_slot:
            sev, strength, cls = "high", "strong", "evidence_backed_potential"
        elif before:
            sev, strength, cls = "medium", "moderate", "evidence_backed_potential"
        else:
            sev, strength, cls = "low", "weak", "heuristic_warning"
        limits = list(RULES[RULE_ID]["limitations"])
        if not reachable:
            cls = "inconclusive"
            limits.insert(0, "The CALL is not reachable from offset 0 via resolved CFG edges; it may be reachable only "
                             "through unresolved dynamic jumps, or be dead code.")
        if cfg.unresolved_jumps:
            limits.append(f"{len(cfg.unresolved_jumps)} unresolved dynamic jump(s) exist; the CFG is incomplete.")

        eids = [ev("external_call", f"CALL at 0x{c:x}; value argument: {value}", [c], {"value_status": value,
                                                                                         "reachable_from_entry": reachable})]
        for s in before[:MAX_LISTED_OFFSETS]:
            eids.append(ev("storage_read", f"SLOAD at 0x{s:x} can execute before the CALL"
                           + (f" (constant slot 0x{slot_of[s]:x})" if slot_of.get(s) is not None else ""), [s],
                           {"slot": slot_of.get(s)}))
        for s in after[:MAX_LISTED_OFFSETS]:
            eids.append(ev("storage_write", f"SSTORE at 0x{s:x} can execute after the CALL"
                           + (f" (constant slot 0x{slot_of[s]:x})" if slot_of.get(s) is not None else ""), [s],
                           {"slot": slot_of.get(s)}))
        path = _bfs_block_path(cfg, cb, ins_block[after[0]])
        if path:
            eids.append(ev("cfg_path", "Resolved CFG path (block start offsets) from the CALL's block to the SSTORE's block",
                           [c, after[0]], {"blocks": path}))
        if same_slot:
            l, s = same_slot[0]
            eids.append(ev("storage_read", f"SLOAD 0x{l:x} and SSTORE 0x{s:x} use the same constant slot 0x{slot_of[l]:x}",
                           [l, s], {"slot": slot_of[l]}))

        offs = sorted({c, *before[:MAX_LISTED_OFFSETS], *after[:MAX_LISTED_OFFSETS]})
        findings.append(Finding(
            id="F-" + short_hash(RULE_ID, RULE_VERSION, c), rule_id=RULE_ID, rule_version=RULE_VERSION,
            title="State update after external call (potential reentrancy)",
            description=f"The CALL at 0x{c:x} can be followed on a resolved control-flow path by "
                        f"{len(after)} SSTORE instruction(s). If the callee re-enters before the write, "
                        "checks made on earlier state may be bypassed.",
            severity=sev, classification=cls, evidence_strength=strength, exploitability="not_assessed",
            offsets=offs, evidence_ids=eids, preconditions=RULES[RULE_ID]["preconditions"],
            remediation=["Apply checks-effects-interactions: perform storage updates before the external call.",
                         "Or use a reentrancy guard (non-reentrant lock) on state-changing entry points.",
                         "Prefer pull-payment patterns for value transfers."],
            verification_steps=["Map the offsets to source via the compiler's source map / your build artifacts.",
                                "Write a test with a malicious callee that re-enters before the SSTORE executes.",
                                "Re-run the analysis on the patched bytecode and review the evidence manually; "
                                "absence of a finding is not proof of a fix."],
            false_positive_considerations=RULES[RULE_ID]["false_positives"], limitations=limits,
            potential_impact="If exploitable: repeated withdrawals or violated accounting invariants. "
                             "Exploitability is NOT assessed by this rule.",
        ))
    return findings, list(evidence.values()), sorted(sites, key=lambda s: s["offset"])
