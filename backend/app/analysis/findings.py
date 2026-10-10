from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, asdict
from typing import Optional

SEVERITIES = ("informational", "low", "medium", "high")  # no "critical": engine cannot establish exploitability
CLASSIFICATIONS = ("evidence_backed_potential", "heuristic_warning", "inconclusive")


def short_hash(*parts) -> str:
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12]


@dataclass
class Evidence:
    id: str
    kind: str  # external_call | storage_read | storage_write | cfg_path | symbolic_path | analysis_gap
    description: str
    offsets: list[int] = field(default_factory=list)
    data: dict = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)


@dataclass
class Finding:
    id: str
    rule_id: str
    rule_version: str
    title: str
    description: str
    severity: str
    classification: str
    evidence_strength: str  # strong | moderate | weak | none
    exploitability: str  # always "not_assessed" from the static engine; symbolic reachability is reported separately
    offsets: list[int]
    evidence_ids: list[str]
    preconditions: list[str]
    remediation: list[str]
    verification_steps: list[str]
    false_positive_considerations: list[str]
    limitations: list[str]
    potential_impact: str
    solver_status: str = "not_run"
    path_conditions: list[str] = field(default_factory=list)
    witness: dict = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)
