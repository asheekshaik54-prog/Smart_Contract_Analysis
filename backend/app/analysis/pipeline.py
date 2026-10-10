from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Callable, Optional

from . import __version__
from .cfg import build_cfg
from .coverage import compute_coverage
from .decoder import decode
from .differential import diff_bytecode
from .opcode_metadata import DEFAULT_REVISION, REVISIONS
from .static_reentrancy import RULE_SET_VERSION, RULES, analyze_reentrancy
from .symbolic_executor import SymbolicConfig, apply_symbolic, run_symbolic
from .validator import DEFAULT_MAX_BYTES, normalize_bytecode

GLOBAL_LIMITATIONS = [
    "Results are limited to the rules and EVM subset listed in this report; absence of findings does NOT mean the contract is secure.",
    "Only REENT-001 (state write after CALL) is implemented. Other vulnerability classes are not analysed.",
    "No source code is available or inferred; offsets refer to the supplied runtime bytecode.",
    "Trailing compiler metadata (e.g. Solidity CBOR) is decoded as instructions and may appear as unknown opcodes.",
    "Control flow is reconstructed only from intra-block constant jump targets; dynamic jumps are unresolved.",
]


@dataclass
class AnalysisConfig:
    revision: str = DEFAULT_REVISION
    max_bytes: int = DEFAULT_MAX_BYTES
    run_symbolic: bool = True
    symbolic: SymbolicConfig = field(default_factory=SymbolicConfig)

    def canonical(self) -> dict:
        d = {"revision": self.revision, "max_bytes": self.max_bytes, "run_symbolic": self.run_symbolic}
        if self.run_symbolic:
            d["symbolic"] = self.symbolic.to_dict()
            d["symbolic"].pop("max_seconds", None)  # wall-clock budget is non-deterministic; recorded separately
        return d


def _h(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def analyze(raw_hex: str, config: Optional[AnalysisConfig] = None, cancel: Optional[Callable[[], bool]] = None) -> dict:
    cfgc = config or AnalysisConfig()
    code = normalize_bytecode(raw_hex, cfgc.max_bytes)
    dec = decode(code.data, cfgc.revision)
    cfg = build_cfg(dec)
    findings, evidence, sites = analyze_reentrancy(dec, cfg)
    sym = None
    if cfgc.run_symbolic:
        sym = run_symbolic(dec, code.data, cfgc.symbolic, cancel)
        apply_symbolic(findings, evidence, sym)
    cov = compute_coverage(code.size, dec, cfg, sites, sym)

    status = "completed"
    reasons = []
    if cfg.unresolved_jumps:
        reasons.append(f"{len(cfg.unresolved_jumps)} unresolved dynamic jump(s)")
    if cov["decoding"]["unsupported_offsets"]:
        reasons.append("unsupported/unknown/truncated instructions present")
    if sym is None:
        reasons.append("symbolic execution not run")
    elif sym["status"] != "complete_within_model":
        reasons.append(f"symbolic execution {sym['status']}")
    if sym and sym["status"] == "cancelled":
        status = "cancelled"
    elif reasons:
        status = "completed_with_limitations"

    fdicts = [f.to_dict() for f in findings]
    input_fp = _h({"bytecode_sha256": code.sha256, "size": code.size, "analyzer_version": __version__,
                   "rule_set_version": RULE_SET_VERSION, "config": cfgc.canonical()})
    result_fp = _h({"input_fingerprint": input_fp, "status": status,
                    "findings": sorted((f["id"], f["severity"], f["classification"], f["solver_status"]) for f in fdicts)})
    return {
        "scan_id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analyzer_version": __version__,
        "rule_set_version": RULE_SET_VERSION,
        "status": status,
        "limitation_reasons": reasons,
        "bytecode": {"sha256": code.sha256, "size_bytes": code.size, "evm_revision": cfgc.revision},
        "configuration": cfgc.canonical(),
        "fingerprint": {
            "input_fingerprint_sha256": input_fp, "result_fingerprint_sha256": result_fp,
            "reproducibility_note": "Identical bytecode alone does not guarantee identical results. Reproduction requires "
                                    "the same analyzer version, rule-set version, EVM revision and configuration. "
                                    "Symbolic results can also differ if the wall-clock budget (max_seconds) or Z3 "
                                    "timeouts are hit at different points."},
        "rules": RULES,
        "findings": fdicts,
        "evidence": [e.to_dict() for e in evidence],
        "coverage": cov,
        "symbolic_execution": sym,
        "instructions": [i.to_dict() for i in dec.instructions],
        "cfg": {"blocks": [{"start": b.start, "end": b.end, "unresolved_jump": b.unresolved_jump,
                            "invalid_jump_target": b.invalid_jump_target} for b in cfg.blocks.values()],
                "edges": [asdict(e) for e in cfg.edges]},
        "limitations": GLOBAL_LIMITATIONS,
    }


def compare(raw_a: str, raw_b: str, config: Optional[AnalysisConfig] = None) -> dict:
    cfgc = config or AnalysisConfig()
    ra, rb = analyze(raw_a, cfgc), analyze(raw_b, cfgc)
    ca, cb = normalize_bytecode(raw_a, cfgc.max_bytes), normalize_bytecode(raw_b, cfgc.max_bytes)
    d = diff_bytecode(ca.data, cb.data, decode(ca.data, cfgc.revision), decode(cb.data, cfgc.revision),
                      ra["findings"], rb["findings"])
    d["original"] = {"sha256": ra["bytecode"]["sha256"], "status": ra["status"]}
    d["updated"] = {"sha256": rb["bytecode"]["sha256"], "status": rb["status"]}
    return d
