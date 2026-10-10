# SkillNova Sentinel

EVM smart-contract analyzer: bytecode decompilation (decoding + CFG) and bounded reentrancy symbolic execution.
**Status: engine + stateless API implemented and tested. Frontend/3D, persistence, auth, RPC, PDF reports: NOT started.**

## Run
```
cd backend
pip install -r requirements.txt
python -m pytest -q                     # 53 tests
uvicorn app.api.main:app --reload       # docs at /docs
curl -X POST localhost:8000/api/v1/analyze -H 'content-type: application/json' -d '{"bytecode":"0x6001"}'
```

## Feature status
| Area | Status |
|---|---|
| Validator, decoder (PUSH-correct, revisions) | Implemented, tested, cross-checked vs pyevmasm |
| CFG (intra-block constant jump resolution) | Implemented, tested; under-approximates real code |
| REENT-001 static rule + evidence + severity rubric | Implemented, tested; known FP/FN (docs/limitations.md) |
| Bounded symbolic execution (Z3) | Implemented for documented subset, tested; incomplete on real contracts |
| Coverage (decoding vs structure vs security) | Implemented |
| Fingerprint / reproducibility | Implemented, tested |
| Differential analysis | Byte + instruction level only |
| JSON report | Analyze response is the report |
| Stateless FastAPI (`/analyze`, `/compare`, health/ready) | Implemented, tested |
| PDF report | Not started |
| PostgreSQL, Alembic, auth, projects, history, rate limiting, background workers | Not started |
| Read-only RPC retrieval, proxy resolution | Not started |
| React/TypeScript frontend, 3D hero, evidence graph, motion system | Not started |
| Docker/Compose, reverse proxy | Not started |
| CI workflow | Written, not executed |

Release readiness: **incomplete** - not suitable for deployment. See docs/.
