import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const Th = ({ children }: { children: string }) => <th className="border-b border-line px-3 py-2 text-left text-xs font-medium text-muted">{children}</th>
const Td = ({ children }: { children: string }) => <td className="border-b border-line/60 px-3 py-2 align-top">{children}</td>
const RUBRIC = [
  ['Call value is a visible constant 0', 'informational', 'heuristic warning', 'weak'],
  ['SLOAD before + SSTORE after on the same constant slot', 'high', 'evidence-backed potential', 'strong'],
  ['SLOAD before + SSTORE after, slots not provably equal', 'medium', 'evidence-backed potential', 'moderate'],
  ['SSTORE after only', 'low', 'heuristic warning', 'weak'],
  ['CALL unreachable from offset 0 via resolved edges', 'unchanged', 'inconclusive', 'unchanged'],
]

export default function Methodology() {
  const { hash } = useLocation()
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [hash])
  const h2 = 'mt-12 text-2xl'
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl">Analysis methodology</h1>
      <p className="mt-3 text-muted">What the engine does, exactly, as implemented in analyzer v0.1.0 (rule set 2026.10-r1). The same text lives in <code className="mono">docs/analysis-methodology.md</code>.</p>

      <h2 className={h2}>Pipeline</h2>
      <p className="mt-3 text-muted">Validate, decode, rebuild control flow, run rule REENT-001, run bounded symbolic execution, compute coverage, then fingerprint.</p>

      <h2 className={h2}>Decoding and control flow</h2>
      <p className="mt-3 text-muted">Each instruction gets an offset and size. PUSH immediates are data: a <code className="mono">5b</code> byte inside PUSH data is not a JUMPDEST. Opcodes are checked against the chosen EVM revision (Homestead to Cancun). Basic blocks start at offset 0, at each JUMPDEST and after each jump, halt or invalid instruction. A jump target is resolved only when it is a constant visible inside the same block; everything else is an <em>unresolved dynamic jump</em> and gets no edge. On real compiler output, internal function returns are dynamic jumps, so the graph under-approximates real control flow.</p>

      <h2 className={h2}>Rule REENT-001 v1.0.0</h2>
      <p className="mt-3 text-muted">Fires for each CALL that has a resolved-graph path to an SSTORE. An external call on its own is never a finding. Severity comes from a project-specific rubric, not CVSS. There is no "critical" level because the engine cannot establish exploitability.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Condition</Th><Th>Severity</Th><Th>Classification</Th><Th>Evidence</Th></tr></thead>
        <tbody>{RUBRIC.map((r) => <tr key={r[0]}>{r.map((c) => <Td key={c}>{c}</Td>)}</tr>)}</tbody></table></div>

      <h2 className={h2}>Symbolic execution</h2>
      <p className="mt-3 text-muted">Z3 explores paths over 256-bit bit-vectors. Modelled: stack operations, arithmetic, bitwise and comparison operators (with EVM division-by-zero and shift semantics), jumps with concrete targets, memory, storage, transient storage, calldata, environment values, KECCAK256 over a concrete length of at most 256 bytes (as an uninterpreted function), and CALL / STATICCALL with an unconstrained success flag. Not modelled, so the path stops: CALLDATACOPY, CODECOPY, EXTCODECOPY, RETURNDATACOPY, MCOPY, CREATE, CREATE2, CALLCODE, DELEGATECALL, symbolic EXP or SIGNEXTEND, and symbolic jump targets. Limits cover paths, instructions, depth per path, loop visits, solver time and wall-clock time.</p>
      <p className="mt-3 text-muted">The callee is never modelled. A satisfiable path means "reachable in the model", not "exploitable", and a solver outcome never changes a finding's severity.</p>

      <h2 className={h2}>Fingerprint</h2>
      <p className="mt-3 text-muted">The input fingerprint is a SHA-256 over the bytecode hash and size, analyzer version, rule-set version and configuration. Identical bytecode alone does not guarantee identical results: the analyzer version, rule set, revision and limits must match, and wall-clock or solver timeouts can land differently between runs.</p>

      <h2 id="limitations" className={h2}>Known limitations</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
        <li>Only one rule exists. No findings is not a security guarantee, and other vulnerability classes are not checked.</li>
        <li><strong className="text-fg">False negatives:</strong> code behind unresolved jumps is invisible to the rule. On solc -O0 output the vulnerable test contract is reported only as low and inconclusive, although the solver reaches the path.</li>
        <li><strong className="text-fg">False positives:</strong> reentrancy locks are not recognized. A nonReentrant test contract is flagged high.</li>
        <li>Cross-function, cross-contract and read-only reentrancy are not modelled; CALLCODE, DELEGATECALL and STATICCALL are listed but not analysed by the rule.</li>
        <li>Symbolic execution ends as <em>incomplete</em> on typical compiler output because some opcodes (for example RETURNDATACOPY) are unmodelled.</li>
        <li>Compiler metadata at the end of runtime code is decoded as instructions and shows up as unknown or truncated bytes.</li>
        <li>Source mapping, proxy resolution and fetching code over RPC are not implemented.</li>
        <li>Comparison is byte and instruction level only. A finding disappearing does not show a fix.</li>
        <li>Validated on three small contracts at two optimizer settings. That is not a benchmark and no accuracy rate is claimed.</li>
      </ul>
    </div>
  )
}
