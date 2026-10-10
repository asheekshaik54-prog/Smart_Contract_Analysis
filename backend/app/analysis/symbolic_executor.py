"""Bounded symbolic execution over an explicitly modelled EVM subset, using Z3 (256-bit bit-vectors).

Design rules
  * Every modelled opcode has an explicit Z3 mapping below. Opcodes without one terminate the path with
    reason ``unsupported:<OPCODE>`` - semantics are never approximated silently.
  * Real EVM exceptional halts (stack underflow, invalid jump, invalid opcode) end a path as ``exceptional``.
  * Resource limits end paths as ``limit`` and make the overall status ``incomplete``.
  * A satisfiable modelled path is NOT proof of a real exploit. See ASSUMPTIONS.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, asdict, field
from typing import Callable, Optional

import z3

from .decoder import DecodeResult, VALID
from .opcode_metadata import OPCODES

W = 256
MASK = (1 << W) - 1
BVS = z3.BitVecSort(W)
BV8 = z3.BitVecSort(8)

ASSUMPTIONS = [
    "Execution starts at offset 0 with an empty stack and zeroed memory; storage, calldata, caller, value and block "
    "environment are unconstrained symbols (caller/address/origin are < 2^160, calldatasize < 2^32).",
    "CALL/STATICCALL return an unconstrained success flag. Callee behaviour is NOT modelled: no reentrancy into this "
    "contract, no balance changes, no returndata, no memory write to the return area.",
    "LOG0-LOG4 are treated as side-effect-free. GAS and MSIZE return fresh unconstrained values.",
    "KECCAK256 over a concrete length <= 256 is an uninterpreted function of the hashed bytes (no collision-resistance "
    "or real-hash facts are modelled).",
    "BALANCE, EXTCODESIZE, EXTCODEHASH, BLOCKHASH, BLOBHASH are uninterpreted functions of their argument.",
    "Gas exhaustion is not modelled.",
]


@dataclass
class SymbolicConfig:
    max_paths: int = 256
    max_steps: int = 50_000
    max_depth: int = 2_000
    max_jumpdest_visits: int = 3
    solver_timeout_ms: int = 2_000
    max_seconds: float = 20.0
    max_stack: int = 1024

    def to_dict(self):
        return asdict(self)


class _Term(Exception):
    def __init__(self, category: str, reason: str):
        self.category, self.reason = category, reason


@dataclass
class _State:
    pc: int
    stack: list
    mem: object
    storage: object
    tstorage: object
    cons: list
    calls: list  # offsets of CALL-like events so far
    visits: dict
    depth: int = 0

    def fork(self) -> "_State":
        return _State(self.pc, list(self.stack), self.mem, self.storage, self.tstorage, list(self.cons),
                      list(self.calls), dict(self.visits), self.depth)


ENV_SYMBOLS = {"ADDRESS": "address", "ORIGIN": "origin", "CALLER": "caller", "CALLVALUE": "callvalue",
               "CALLDATASIZE": "calldatasize", "GASPRICE": "gasprice", "COINBASE": "coinbase",
               "TIMESTAMP": "timestamp", "NUMBER": "number", "PREVRANDAO": "prevrandao", "GASLIMIT": "gaslimit",
               "CHAINID": "chainid", "SELFBALANCE": "selfbalance", "BASEFEE": "basefee",
               "BLOBBASEFEE": "blobbasefee", "RETURNDATASIZE": "returndatasize"}
UF_OPS = {"BALANCE", "EXTCODESIZE", "EXTCODEHASH", "BLOCKHASH", "BLOBHASH"}
UNSUPPORTED = {"CALLDATACOPY", "CODECOPY", "EXTCODECOPY", "RETURNDATACOPY", "MCOPY", "CREATE", "CREATE2",
               "CALLCODE", "DELEGATECALL"}


def _val(x: int):
    return z3.BitVecVal(x & MASK, W)


def _b(c):
    return z3.If(c, _val(1), _val(0))


def _concrete(e) -> Optional[int]:
    e = z3.simplify(e)
    return e.as_long() if z3.is_bv_value(e) else None


class SymbolicExecutor:
    def __init__(self, dec: DecodeResult, code: bytes, cfg: Optional[SymbolicConfig] = None,
                 cancel: Optional[Callable[[], bool]] = None):
        self.dec, self.code = dec, code
        self.cfg = cfg or SymbolicConfig()
        self.cancel = cancel or (lambda: False)
        self.ins = dec.by_offset
        self.jd = dec.valid_jumpdests
        self.env = {n: z3.BitVec(s, W) for n, s in ENV_SYMBOLS.items()}
        self.calldata = z3.Array("calldata", BVS, BV8)
        self.ufs = {n: z3.Function(n, BVS, BVS) for n in UF_OPS}
        self.kecc: dict[int, object] = {}
        self._fresh = 0
        self.term: dict[str, int] = {}
        self.unsupported: dict[str, int] = {}
        self.pairs: dict[tuple[int, int], dict] = {}
        self.call_value: dict[int, str] = {}
        self.steps = 0

    # ---- helpers -------------------------------------------------------------------------
    def fresh(self, name):
        self._fresh += 1
        return z3.BitVec(f"{name}_{self._fresh}", W)

    def _check(self, cons, extra=None):
        s = z3.Solver()
        s.set("timeout", self.cfg.solver_timeout_ms)
        s.add(*cons)
        if extra is not None:
            s.add(extra)
        return s.check(), s

    def _load(self, mem, off):
        return z3.Concat(*[z3.Select(mem, off + _val(i)) for i in range(32)])

    def _calldataload(self, off):
        size = self.env["CALLDATASIZE"]
        parts = [z3.If(z3.ULT(off + _val(i), size), z3.Select(self.calldata, off + _val(i)), z3.BitVecVal(0, 8))
                 for i in range(32)]
        return z3.Concat(*parts)

    def _end(self, category, reason):
        key = f"{category}:{reason}"
        self.term[key] = self.term.get(key, 0) + 1

    # ---- main loop -----------------------------------------------------------------------
    def run(self) -> dict:
        t0 = time.monotonic()
        init = _State(0, [], z3.K(BVS, z3.BitVecVal(0, 8)), z3.Array("storage0", BVS, BVS),
                      z3.K(BVS, _val(0)), [], [], {})
        e = self.env
        init.cons += [z3.ULT(e["CALLER"], _val(1 << 160)), z3.ULT(e["ADDRESS"], _val(1 << 160)),
                      z3.ULT(e["ORIGIN"], _val(1 << 160)), z3.ULT(e["CALLDATASIZE"], _val(1 << 32))]
        work, started, cancelled = [init], 1, False
        reason_stop = None
        while work:
            if self.cancel():
                cancelled = True
                break
            if time.monotonic() - t0 > self.cfg.max_seconds:
                reason_stop = "time_budget"
                break
            if self.steps >= self.cfg.max_steps:
                reason_stop = "step_budget"
                break
            st = work.pop()
            started += self._run_state(st, work, started, t0)
        for _ in work:
            self._end("limit", reason_stop or "cancelled")
        if cancelled:
            status = "cancelled"
        else:
            incomplete = any(k.startswith(("limit:", "unsupported:", "solver:")) for k in self.term)
            status = "incomplete" if incomplete else "complete_within_model"
        pairs = [{"call_offset": c, "sstore_offset": s, **w} for (c, s), w in sorted(self.pairs.items())]
        return {"status": status, "config": self.cfg.to_dict(), "steps": self.steps, "paths_started": started,
                "terminations": dict(sorted(self.term.items())), "unsupported_opcodes": dict(sorted(self.unsupported.items())),
                "call_then_sstore_paths": pairs, "call_value_feasibility": {str(k): v for k, v in sorted(self.call_value.items())},
                "assumptions": ASSUMPTIONS}

    def _run_state(self, st: _State, work: list, started: int, t0: float) -> int:
        new_paths = 0
        try:
            while True:
                if self.steps % 64 == 0 and (self.cancel() or time.monotonic() - t0 > self.cfg.max_seconds):
                    raise _Term("limit", "cancelled_or_time")
                if self.steps >= self.cfg.max_steps:
                    raise _Term("limit", "step_budget")
                if st.depth >= self.cfg.max_depth:
                    raise _Term("limit", "depth_limit")
                ins = self.ins.get(st.pc)
                if ins is None:
                    raise _Term("halt", "END_OF_CODE")
                self.steps += 1
                st.depth += 1
                new_paths += self._step(ins, st, work, started + new_paths)
                if st.pc is None:  # path handed off at a fork
                    return new_paths
        except _Term as t:
            self._end(t.category, t.reason)
        return new_paths

    def _pop(self, st):
        if not st.stack:
            raise _Term("exceptional", "stack_underflow")
        return st.stack.pop()

    def _push(self, st, v):
        if len(st.stack) >= self.cfg.max_stack:
            raise _Term("exceptional", "stack_overflow")
        st.stack.append(v)

    def _step(self, ins, st: _State, work: list, started: int) -> int:
        if ins.status != VALID:
            raise _Term("exceptional", f"invalid_opcode:{ins.mnemonic}")
        n = ins.mnemonic
        nxt = ins.offset + ins.size
        pop, push = (lambda: self._pop(st)), (lambda v: self._push(st, v))

        if n.startswith("PUSH") and n != "PUSH0":
            push(_val(ins.imm_int))
        elif n == "PUSH0":
            push(_val(0))
        elif n.startswith("DUP"):
            k = int(n[3:])
            if len(st.stack) < k:
                raise _Term("exceptional", "stack_underflow")
            push(st.stack[-k])
        elif n.startswith("SWAP"):
            k = int(n[4:])
            if len(st.stack) < k + 1:
                raise _Term("exceptional", "stack_underflow")
            st.stack[-1], st.stack[-1 - k] = st.stack[-1 - k], st.stack[-1]
        elif n == "POP":
            pop()
        elif n in ("STOP", "RETURN", "REVERT", "SELFDESTRUCT", "INVALID"):
            for _ in range(OPCODES[ins.opcode].pops):
                pop()
            raise _Term("halt", n)
        elif n == "JUMPDEST":
            c = st.visits.get(ins.offset, 0) + 1
            st.visits[ins.offset] = c
            if c > self.cfg.max_jumpdest_visits:
                raise _Term("limit", "loop_bound")
        elif n == "JUMP":
            self._goto(self._dest(pop()), st)
            return 0
        elif n == "JUMPI":
            dest, cond = pop(), pop()
            return self._jumpi(ins, st, dest, cond, work, started, nxt)
        elif n in ("ADD", "MUL", "SUB", "AND", "OR", "XOR"):
            a, b = pop(), pop()
            push({"ADD": a + b, "MUL": a * b, "SUB": a - b, "AND": a & b, "OR": a | b, "XOR": a ^ b}[n])
        elif n == "DIV":
            a, b = pop(), pop(); push(z3.If(b == 0, _val(0), z3.UDiv(a, b)))
        elif n == "SDIV":
            a, b = pop(), pop(); push(z3.If(b == 0, _val(0), a / b))
        elif n == "MOD":
            a, b = pop(), pop(); push(z3.If(b == 0, _val(0), z3.URem(a, b)))
        elif n == "SMOD":
            a, b = pop(), pop(); push(z3.If(b == 0, _val(0), z3.SRem(a, b)))
        elif n == "ADDMOD":
            a, b, m = pop(), pop(), pop()
            r = z3.URem(z3.ZeroExt(1, a) + z3.ZeroExt(1, b), z3.ZeroExt(1, m))
            push(z3.If(m == 0, _val(0), z3.Extract(W - 1, 0, r)))
        elif n == "MULMOD":
            a, b, m = pop(), pop(), pop()
            r = z3.URem(z3.ZeroExt(W, a) * z3.ZeroExt(W, b), z3.ZeroExt(W, m))
            push(z3.If(m == 0, _val(0), z3.Extract(W - 1, 0, r)))
        elif n == "EXP":
            a, b = pop(), pop()
            ca, cb = _concrete(a), _concrete(b)
            if ca is None or cb is None:
                raise _Term("unsupported", "EXP_symbolic")
            push(_val(pow(ca, cb, 1 << W)))
        elif n == "SIGNEXTEND":
            b, x = pop(), pop()
            cb, cx = _concrete(b), _concrete(x)
            if cb is None or cx is None:
                raise _Term("unsupported", "SIGNEXTEND_symbolic")
            if cb < 31:
                bit = 8 * cb + 7
                m = (1 << bit) - 1
                cx = (cx | ~m) & MASK if (cx >> bit) & 1 else cx & m
            push(_val(cx))
        elif n == "LT":
            a, b = pop(), pop(); push(_b(z3.ULT(a, b)))
        elif n == "GT":
            a, b = pop(), pop(); push(_b(z3.UGT(a, b)))
        elif n == "SLT":
            a, b = pop(), pop(); push(_b(a < b))
        elif n == "SGT":
            a, b = pop(), pop(); push(_b(a > b))
        elif n == "EQ":
            a, b = pop(), pop(); push(_b(a == b))
        elif n == "ISZERO":
            a = pop(); push(_b(a == 0))
        elif n == "NOT":
            push(~pop())
        elif n == "BYTE":
            i, x = pop(), pop()
            push(z3.If(z3.ULT(i, _val(32)), z3.LShR(x, (_val(31) - i) * 8) & _val(0xFF), _val(0)))
        elif n == "SHL":
            s, v = pop(), pop(); push(v << s)
        elif n == "SHR":
            s, v = pop(), pop(); push(z3.LShR(v, s))
        elif n == "SAR":
            s, v = pop(), pop(); push(v >> s)
        elif n == "KECCAK256":
            off, size = pop(), pop()
            cs = _concrete(size)
            if cs is None or cs > 256:
                raise _Term("unsupported", "KECCAK256_symbolic_or_large_size")
            if cs == 0:
                push(self.fresh("keccak_empty"))
            else:
                data = z3.Concat(*[z3.Select(st.mem, off + _val(i)) for i in range(cs)])
                if cs not in self.kecc:
                    self.kecc[cs] = z3.Function(f"keccak_{cs}", z3.BitVecSort(8 * cs), BVS)
                push(self.kecc[cs](data))
        elif n in ENV_SYMBOLS:
            push(self.env[n])
        elif n == "CODESIZE":
            push(_val(len(self.code)))
        elif n == "PC":
            push(_val(ins.offset))
        elif n in ("GAS", "MSIZE"):
            push(self.fresh(n))
        elif n in UF_OPS:
            push(self.ufs[n](pop()))
        elif n == "CALLDATALOAD":
            push(self._calldataload(pop()))
        elif n == "MLOAD":
            push(self._load(st.mem, pop()))
        elif n == "MSTORE":
            off, v = pop(), pop()
            for i in range(32):
                st.mem = z3.Store(st.mem, off + _val(i), z3.Extract(255 - 8 * i, 248 - 8 * i, v))
        elif n == "MSTORE8":
            off, v = pop(), pop(); st.mem = z3.Store(st.mem, off, z3.Extract(7, 0, v))
        elif n == "SLOAD":
            push(z3.Select(st.storage, pop()))
        elif n == "TLOAD":
            push(z3.Select(st.tstorage, pop()))
        elif n == "TSTORE":
            k, v = pop(), pop(); st.tstorage = z3.Store(st.tstorage, k, v)
        elif n == "SSTORE":
            k, v = pop(), pop()
            st.storage = z3.Store(st.storage, k, v)
            for c in dict.fromkeys(st.calls):
                self._record_pair(c, ins.offset, st)
        elif n.startswith("LOG"):
            for _ in range(OPCODES[ins.opcode].pops):
                pop()
        elif n in ("CALL", "STATICCALL"):
            args = [pop() for _ in range(OPCODES[ins.opcode].pops)]
            if n == "CALL" and ins.offset not in self.call_value:
                r, _ = self._check(st.cons, args[2] != 0)
                self.call_value[ins.offset] = ("nonzero_value_feasible" if r == z3.sat
                                               else "value_always_zero" if r == z3.unsat else "unknown")
            if n == "CALL":
                st.calls.append(ins.offset)
            push(self.fresh("call_success"))
        elif n in UNSUPPORTED:
            self.unsupported[n] = self.unsupported.get(n, 0) + 1
            raise _Term("unsupported", n)
        else:  # defensive: known opcode without a model
            self.unsupported[n] = self.unsupported.get(n, 0) + 1
            raise _Term("unsupported", n)
        st.pc = nxt
        return 0

    # ---- control flow --------------------------------------------------------------------
    def _dest(self, d) -> int:
        c = _concrete(d)
        if c is None:
            raise _Term("unsupported", "symbolic_jump_target")
        return c

    def _goto(self, dest: int, st: _State):
        if dest not in self.jd:
            raise _Term("exceptional", "invalid_jump")
        st.pc = dest

    def _jumpi(self, ins, st, dest, cond, work, started, nxt) -> int:
        d = self._dest(dest)
        c = _concrete(cond)
        if c is not None:
            if c:
                self._goto(d, st)
            else:
                st.pc = nxt
            return 0
        truthy, falsy = cond != 0, cond == 0
        rt, _ = self._check(st.cons, truthy)
        rf, _ = self._check(st.cons, falsy)
        for r in (rt, rf):
            if r == z3.unknown:
                self._end("solver", "unknown_or_timeout")
        feasible = []
        if rf == z3.sat:
            feasible.append(("f", falsy))
        if rt == z3.sat:
            feasible.append(("t", truthy))
        if not feasible:
            raise _Term("pruned", "infeasible_or_unknown")
        added = 0
        branches = []
        for tag, cn in feasible:
            if tag == "t" and d not in self.jd:
                self._end("exceptional", "invalid_jump")
                continue
            s = st.fork()
            s.cons.append(cn)
            s.pc = d if tag == "t" else nxt
            branches.append(s)
        if not branches:
            raise _Term("pruned", "no_valid_branch")
        # first branch continues in `work`; enforce path limit on additional paths
        for s in reversed(branches):
            if started + added >= self.cfg.max_paths:
                self._end("limit", "path_limit")
                continue
            work.append(s)
            added += 1
        st.pc = None
        return max(0, added - 1)

    def _record_pair(self, call: int, sstore: int, st: _State):
        key = (call, sstore)
        if key in self.pairs:
            return
        r, s = self._check(st.cons)
        if r != z3.sat:
            return
        m = s.model()
        ev = lambda e: m.eval(e, model_completion=True)
        cd = z3.Concat(*[z3.Select(self.calldata, _val(i)) for i in range(36)])
        self.pairs[key] = {
            "status": "satisfiable_modeled_path",
            "path_conditions": [str(z3.simplify(c))[:200] for c in st.cons[4:16]],
            "path_condition_count": max(0, len(st.cons) - 4),
            "witness": {"caller": hex(ev(self.env["CALLER"]).as_long()),
                        "callvalue": hex(ev(self.env["CALLVALUE"]).as_long()),
                        "calldatasize": ev(self.env["CALLDATASIZE"]).as_long(),
                        "calldata_prefix_36_bytes": f"{ev(cd).as_long():072x}"},
        }


def run_symbolic(dec: DecodeResult, code: bytes, cfg: Optional[SymbolicConfig] = None,
                 cancel: Optional[Callable[[], bool]] = None) -> dict:
    return SymbolicExecutor(dec, code, cfg, cancel).run()


def apply_symbolic(findings, evidence, sym: dict):
    """Attach solver outcomes to findings. Never changes severity or classification."""
    from .findings import Evidence, short_hash
    pairs = {}
    for p in sym["call_then_sstore_paths"]:
        pairs.setdefault(p["call_offset"], []).append(p)
    for f in findings:
        call = next((e.offsets[0] for e in evidence if e.id in f.evidence_ids and e.kind == "external_call"), None)
        ps = pairs.get(call)
        if ps:
            p = ps[0]
            f.solver_status = p["status"]
            f.path_conditions = p["path_conditions"]
            f.witness = p["witness"]
            ev = Evidence("ev-" + short_hash("symbolic", call, p["sstore_offset"]), "symbolic_path",
                          f"Modelled path executes CALL 0x{call:x} then SSTORE 0x{p['sstore_offset']:x} "
                          "(satisfiable under the documented model assumptions)",
                          [call, p["sstore_offset"]], {"path_condition_count": p["path_condition_count"]})
            evidence.append(ev)
            f.evidence_ids.append(ev.id)
        elif sym["status"] == "complete_within_model":
            f.solver_status = "no_modeled_path_found"  # all modelled paths explored; none matched
        else:
            f.solver_status = "inconclusive_" + sym["status"]
