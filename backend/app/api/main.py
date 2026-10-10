"""Stateless FastAPI surface over the engine. Persistence/auth are NOT implemented yet (see docs/feature-status.md)."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.analysis import __version__
from app.analysis.opcode_metadata import DEFAULT_REVISION, REVISIONS
from app.analysis.pipeline import AnalysisConfig, analyze, compare
from app.analysis.symbolic_executor import SymbolicConfig
from app.analysis.validator import ValidationError

MAX_API_BYTES = 24_576
app = FastAPI(title="SkillNova Sentinel", version=__version__)


class Limits(BaseModel):
    max_paths: int = Field(256, ge=1, le=2048)
    max_steps: int = Field(50_000, ge=1, le=200_000)
    max_depth: int = Field(2_000, ge=1, le=10_000)
    max_jumpdest_visits: int = Field(3, ge=1, le=20)
    solver_timeout_ms: int = Field(2_000, ge=50, le=10_000)
    max_seconds: float = Field(20.0, gt=0, le=60)


class ScanRequest(BaseModel):
    bytecode: str = Field(max_length=2 * MAX_API_BYTES + 8)
    evm_revision: str = DEFAULT_REVISION
    run_symbolic: bool = True
    limits: Limits = Limits()


class CompareRequest(BaseModel):
    original: str = Field(max_length=2 * MAX_API_BYTES + 8)
    updated: str = Field(max_length=2 * MAX_API_BYTES + 8)
    evm_revision: str = DEFAULT_REVISION


def _cfg(rev, run_sym=True, lim: Optional[Limits] = None) -> AnalysisConfig:
    if rev not in REVISIONS:
        raise HTTPException(422, {"code": "unsupported_revision", "message": f"Supported revisions: {', '.join(REVISIONS)}"})
    return AnalysisConfig(revision=rev, max_bytes=MAX_API_BYTES, run_symbolic=run_sym,
                          symbolic=SymbolicConfig(**(lim.model_dump() if lim else {})))


@app.middleware("http")
async def request_id(request: Request, call_next):
    rid = request.headers.get("x-request-id") or str(uuid.uuid4())
    resp = await call_next(request)
    resp.headers["x-request-id"] = rid
    resp.headers["x-content-type-options"] = "nosniff"
    return resp


@app.exception_handler(ValidationError)
async def _val(_, e: ValidationError):
    return JSONResponse({"error": {"code": e.code, "message": e.message}}, status_code=422)


@app.get("/health")
def health():
    return {"status": "ok", "version": __version__}


@app.get("/ready")
def ready():
    import z3  # engine dependency check
    z3.Solver()
    return {"status": "ready"}


@app.get("/api/v1/capabilities")
def capabilities():
    return {"analyzer_version": __version__, "evm_revisions": list(REVISIONS), "default_revision": DEFAULT_REVISION,
            "rules": ["REENT-001"], "symbolic_execution": "bounded, Z3, subset (see docs/analysis-methodology.md)",
            "persistence": False, "rpc_retrieval": False}


@app.post("/api/v1/analyze")
async def analyze_bytecode(req: ScanRequest):
    """Stateless analysis. Runs in a worker thread so the event loop is not blocked."""
    return await run_in_threadpool(analyze, req.bytecode, _cfg(req.evm_revision, req.run_symbolic, req.limits))


@app.post("/api/v1/compare")
async def compare_bytecode(req: CompareRequest):
    return await run_in_threadpool(compare, req.original, req.updated, _cfg(req.evm_revision))
