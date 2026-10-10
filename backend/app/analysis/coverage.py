from __future__ import annotations

from .cfg import CFG
from .decoder import DecodeResult, VALID, UNKNOWN, NOT_IN_REVISION, TRUNCATED


def compute_coverage(code_len: int, dec: DecodeResult, cfg: CFG, sites: list[dict], symbolic: dict | None) -> dict:
    ins = dec.instructions
    reach = cfg.reachable_from_entry()
    reach_ins = sum(len(cfg.blocks[b].instructions) for b in reach)
    return {
        "decoding": {
            "bytes": code_len,
            "instructions": len(ins),
            "valid": sum(i.status == VALID for i in ins),
            "unknown_opcodes": sum(i.status == UNKNOWN for i in ins),
            "unavailable_in_revision": sum(i.status == NOT_IN_REVISION for i in ins),
            "truncated_push": sum(i.status == TRUNCATED for i in ins),
            "unsupported_offsets": [i.offset for i in ins if i.status != VALID][:200],
            "note": "Decoding coverage says nothing about whether security rules covered the code.",
        },
        "structure": {
            "basic_blocks": len(cfg.blocks),
            "edges": len(cfg.edges),
            "blocks_reachable_from_entry_via_resolved_edges": len(reach),
            "instructions_reachable_via_resolved_edges": reach_ins,
            "unresolved_dynamic_jumps": list(cfg.unresolved_jumps),
            "invalid_constant_jump_targets": [{"jump": j, "target": t} for j, t in cfg.invalid_jump_targets],
            "note": "Blocks not reachable may be dead code or reachable only through unresolved dynamic jumps.",
        },
        "security_analysis": {
            "rules_executed": ["REENT-001"],
            "external_call_sites": sites,
            "unanalysed_call_kinds": sorted({s["mnemonic"] for s in sites if s["mnemonic"] != "CALL"}),
            "symbolic_execution": symbolic["status"] if symbolic else "not_run",
            "note": "Only the listed rules were run. Many vulnerability classes are not covered.",
        },
    }
