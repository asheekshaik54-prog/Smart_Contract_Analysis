# Testing and evaluation (actual results, 2026-10-10, Python 3.12.3, z3 5.1.0)

Command: `cd backend && python -m pytest -q` -> **53 passed**.

Suites: `test_core.py` (validator, decoder, CFG), `test_static.py` (REENT-001 on hand-assembled fixtures),
`test_symbolic.py` (arithmetic semantics, pruning, loop/depth/step/path limits, cancellation, unsupported ops),
`test_pipeline_api.py` (fingerprint, compare, FastAPI endpoints incl. malformed/oversized input),
`test_solc_fixtures.py` (real solc 0.8.26 bytecode).

## Independent checks performed
- Decoder vs `pyevmasm` on 6 solc outputs: identical instruction offsets/mnemonics/sizes for every valid opcode.
  Differences: reference lacks PUSH0, prints `INVALID` for unknown opcodes, drops a final truncated PUSH.
- Real compiler fixtures (3 contracts x -O0/-O1; sources in `contracts/samples/`):

| Contract | -O0 | -O1 |
|---|---|---|
| VulnerableBank | low / inconclusive (solver: satisfiable path) | medium / evidence-backed (solver: satisfiable path) |
| SafeBank (CEI) | no finding | no finding |
| GuardedBank (lock) | low / inconclusive (**FP class**) | high / evidence-backed (**false positive**) |

Symbolic status on all six: `incomplete` (RETURNDATACOPY unmodelled). Wall time per analysis: 0.38-0.48 s (single
run, this sandbox; not a benchmark).

3 contracts is not a benchmark; no accuracy rate is claimed. No comparison with Slither/Mythril was performed
(tools not installed/run).

## Not tested
Frontend/3D, accessibility, load/performance in browsers, auth/DB, Docker, the GitHub Actions workflow.
