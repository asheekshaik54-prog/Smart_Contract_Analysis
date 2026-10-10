# Analysis methodology (as implemented, v0.1.0)

Pipeline: validate -> decode -> CFG -> REENT-001 static rule -> bounded symbolic execution (Z3) -> coverage -> fingerprint.

## Validation (`validator.py`)
Strip surrounding whitespace, strip one `0x`, lower-case. Rejects empty, odd length, non-hex (including interior
whitespace), oversize (default 24,576 bytes). Nothing else is altered.

## Decoding (`decoder.py`, `opcode_metadata.py`)
Offsets/sizes per instruction; PUSH immediates are never decoded as opcodes; a `0x5b` inside PUSH data is not a
JUMPDEST. Statuses: `valid`, `unknown_opcode`, `unavailable_in_revision`, `truncated_push`. Revisions: homestead ..
cancun. Gas is not modelled.

## CFG (`cfg.py`)
Leaders: offset 0, JUMPDESTs, instruction after JUMP/JUMPI/terminator/invalid. Jump targets are resolved ONLY from
constants visible inside the same basic block (abstract stack with PUSH/DUP/SWAP/POP). Everything else is an
*unresolved dynamic jump* and no edge is added. Consequence: Solidity internal-function returns are unresolved, so the
CFG under-approximates control flow on real compiler output (see testing.md).

## REENT-001 v1.0.0 (`static_reentrancy.py`) - rule-set 2026.10-r1
Fires per CALL that has a resolved-CFG path to an SSTORE. An external call alone never fires.

| Condition | Severity | Classification | Evidence strength |
|---|---|---|---|
| call value is a visible constant 0 | informational | heuristic_warning | weak |
| SLOAD before + SSTORE after on the **same constant slot** | high | evidence_backed_potential | strong |
| SLOAD before + SSTORE after (slots not provably equal) | medium | evidence_backed_potential | moderate |
| SSTORE after only | low | heuristic_warning | weak |
| CALL not reachable from offset 0 via resolved edges | (unchanged) | inconclusive | (unchanged) |

This is a project-specific rubric, not CVSS. `exploitability` is always `not_assessed`. There is no "critical" level
because the engine cannot establish exploitability.

## Symbolic execution (`symbolic_executor.py`)
DFS over 256-bit Z3 bit-vectors. Modelled: stack ops, arithmetic/bitwise/comparison (EVM div-by-zero, shift >= 256
semantics), JUMP/JUMPI with concrete targets, memory (byte array), storage and transient storage (arrays), calldata
(symbolic array bounded by calldatasize), environment symbols, KECCAK256 over concrete length <= 256 (uninterpreted
function), BALANCE-like ops (uninterpreted), CALL/STATICCALL (fresh success flag, callee not modelled), LOG (no-op).
Unsupported (path ends as `unsupported:<OP>`): CALLDATACOPY, CODECOPY, EXTCODECOPY, RETURNDATACOPY, MCOPY, CREATE,
CREATE2, CALLCODE, DELEGATECALL, symbolic EXP/SIGNEXTEND, symbolic jump targets, symbolic KECCAK length.
Limits: max_paths, max_steps, max_depth, max_jumpdest_visits (loop bound), solver timeout, wall-clock, cancellation.
Overall status: `complete_within_model` | `incomplete` | `cancelled`. A satisfiable path means "reachable in the
model", not "exploitable". Solver outcome on a finding never changes its severity.

Per-finding `solver_status`: `satisfiable_modeled_path`, `no_modeled_path_found` (only when exploration was complete
within the model), `inconclusive_incomplete`, `inconclusive_cancelled`, `not_run`.

## Fingerprint
`input_fingerprint` = SHA-256(bytecode hash, size, analyzer version, rule-set version, config without wall-clock
budget). `result_fingerprint` adds status and finding (id, severity, classification, solver status). Scan id and
timestamp are recorded but excluded from hashes.
