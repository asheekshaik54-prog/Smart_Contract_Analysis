"""Byte-level and instruction-level comparison of two bytecodes. Offsets across versions do NOT imply equal semantics."""
from __future__ import annotations

import difflib

from .decoder import DecodeResult
from .opcode_metadata import EXTERNAL_CALLS


def _sig(i):
    return (i.mnemonic, i.immediate, i.status)


def diff_bytecode(a: bytes, b: bytes, da: DecodeResult, db: DecodeResult, fa: list[dict], fb: list[dict]) -> dict:
    n = min(len(a), len(b))
    differing = [i for i in range(n) if a[i] != b[i]]
    ia, ib = da.instructions, db.instructions
    sm = difflib.SequenceMatcher(None, [_sig(i) for i in ia], [_sig(i) for i in ib], autojunk=False)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        ops.append({"op": tag,
                    "original": [{"offset": x.offset, "mnemonic": x.mnemonic, "immediate": x.immediate} for x in ia[i1:i2]][:50],
                    "updated": [{"offset": x.offset, "mnemonic": x.mnemonic, "immediate": x.immediate} for x in ib[j1:j2]][:50]})

    def counts(ins):
        c = {}
        for x in ins:
            if x.mnemonic in EXTERNAL_CALLS or x.mnemonic in ("SLOAD", "SSTORE"):
                c[x.mnemonic] = c.get(x.mnemonic, 0) + 1
        return c

    ca, cb = counts(ia), counts(ib)
    keys = sorted(set(ca) | set(cb))
    key = lambda f: (f["rule_id"], f["classification"], f["severity"])
    ka, kb = {}, {}
    for f in fa: ka.setdefault(key(f), []).append(f["id"])
    for f in fb: kb.setdefault(key(f), []).append(f["id"])
    return {
        "identical": a == b,
        "byte_level": {"original_size": len(a), "updated_size": len(b), "size_delta": len(b) - len(a),
                       "differing_bytes_in_common_prefix_length": len(differing),
                       "first_differing_offset": differing[0] if differing else None},
        "instruction_level": {"changes": ops[:200], "change_count": len(ops), "truncated": len(ops) > 200},
        "call_and_storage_op_counts": {k: {"original": ca.get(k, 0), "updated": cb.get(k, 0)} for k in keys},
        "findings": {
            "added_rule_groups": [{"rule_id": k[0], "classification": k[1], "severity": k[2], "count": len(kb[k])} for k in kb if k not in ka],
            "removed_rule_groups": [{"rule_id": k[0], "classification": k[1], "severity": k[2], "count": len(ka[k])} for k in ka if k not in kb],
            "unchanged_rule_groups": [{"rule_id": k[0], "classification": k[1], "severity": k[2]} for k in ka if k in kb],
        },
        "limitations": ["Instruction diff ignores offsets; inserted code shifts all later offsets and jump targets.",
                        "Basic-block level and semantic equivalence comparison are not implemented.",
                        "A finding disappearing does NOT show the issue is fixed; review the changed code manually."],
    }
