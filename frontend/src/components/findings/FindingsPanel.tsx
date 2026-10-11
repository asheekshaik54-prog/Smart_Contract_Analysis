import { useMemo, useState } from 'react'
import { CLASS_LABEL, Notice, SEVERITY_ORDER, SeverityBadge, cx, hex } from '../ui'
import type { AnalysisResult, Finding } from '../../lib/types'

export const SOLVER_LABEL: Record<string, string> = {
  not_run: 'Symbolic execution was not run',
  satisfiable_modeled_path: 'Satisfiable modelled path: reachable in the engine model. Not proof of a real exploit.',
  no_modeled_path_found: 'No modelled path found. Exploration finished within the model; model limits still apply.',
  inconclusive_incomplete: 'Inconclusive: symbolic exploration was incomplete (resource limits or unmodelled opcodes).',
  inconclusive_cancelled: 'Inconclusive: symbolic exploration was cancelled.',
}
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5 text-muted">{items.map((t) => <li key={t}>{t}</li>)}</ul>
const H = ({ children }: { children: string }) => <h4 className="mb-1 mt-5 text-sm font-semibold">{children}</h4>

export function FindingsPanel({ result, focusedId, onFocus, onJump }: { result: AnalysisResult; focusedId: string | null; onFocus: (id: string | null) => void; onJump: (offset: number) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => result.findings.filter((f) => !needle || (f.title + f.rule_id + f.severity + f.classification).toLowerCase().includes(needle) || f.offsets.some((o) => hex(o).includes(needle))), [result.findings, needle])
  const f = result.findings.find((x) => x.id === focusedId) ?? null
  if (result.findings.length === 0)
    return <Notice title="No REENT-001 findings">This does not mean the contract is secure. Only the reentrancy rule ran, and findings behind unresolved jumps or unmodelled opcodes cannot be seen. Check the Coverage and Symbolic tabs for what was and was not analysed.</Notice>
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <div>
        <label htmlFor="f-q" className="text-xs text-muted">Search findings</label>
        <input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="severity, rule, offset…" className="mb-3 block w-full border border-line bg-ink px-3 py-2 text-sm rounded-pane" />
        {SEVERITY_ORDER.map((s) => {
          const g = shown.filter((x) => x.severity === s); if (!g.length) return null
          return <div key={s} className="mb-4"><p className="mb-1 text-xs text-muted">{g.length} {s}</p>
            <ul className="space-y-1">{g.map((x) => (
              <li key={x.id}><button onClick={() => onFocus(x.id === focusedId ? null : x.id)} aria-pressed={x.id === focusedId}
                className={cx('w-full border px-3 py-2 text-left text-sm rounded-pane transition-colors duration-150', x.id === focusedId ? 'border-cyan bg-cyan/10' : 'border-line hover:border-muted')}>
                <span className="flex items-center justify-between gap-2"><SeverityBadge severity={x.severity} /><span className="mono text-xs text-muted">{x.rule_id}</span></span>
                <span className="mt-1 block">{x.title}</span><span className="mono text-xs text-muted">CALL {hex(x.evidence_ids.length ? (result.evidence.find((e) => e.id === x.evidence_ids[0])?.offsets[0] ?? x.offsets[0]) : x.offsets[0])}</span>
              </button></li>))}</ul></div>
        })}
        {shown.length === 0 && <p className="text-sm text-muted">No findings match.</p>}
      </div>
      <div>{f ? <Detail f={f} r={result} onJump={onJump} /> : <p className="text-muted">Select a finding to see its evidence. The graph and instruction views will highlight it.</p>}</div>
    </div>
  )
}

function Detail({ f, r, onJump }: { f: Finding; r: AnalysisResult; onJump: (o: number) => void }) {
  const ev = r.evidence.filter((e) => f.evidence_ids.includes(e.id))
  return (
    <article aria-label={f.title}>
      <div className="flex flex-wrap items-center gap-3"><SeverityBadge severity={f.severity} /><span className="border border-line px-2 py-0.5 text-xs rounded-pane">{CLASS_LABEL[f.classification]}</span></div>
      <h3 className="mt-3 text-xl">{f.title}</h3>
      <p className="mono mt-1 text-xs text-muted">{f.rule_id} v{f.rule_version} · {f.id}</p>
      <p className="mt-3">{f.description}</p>
      <dl className="mt-4 grid gap-px border border-line bg-line sm:grid-cols-3 [&>div]:bg-panel [&>div]:p-3">
        <div><dt className="text-xs text-muted">Severity</dt><dd>{f.severity}</dd></div>
        <div><dt className="text-xs text-muted">Evidence strength</dt><dd>{f.evidence_strength}</dd></div>
        <div><dt className="text-xs text-muted">Exploitability</dt><dd>Not assessed by the engine</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted">Severity, evidence strength and analysis completeness are separate. The severity rubric is project-specific, not CVSS.</p>
      <H>Evidence</H>
      <ul className="space-y-1">{ev.map((e) => (
        <li key={e.id} className="text-muted"><span className="mono text-xs text-fg">{e.kind.replace('_', ' ')}</span> {e.description}{' '}
          {e.offsets.map((o) => <button key={o} className="mono mr-1 text-cyan underline-offset-2 hover:underline" onClick={() => onJump(o)} aria-label={`Show instruction at ${hex(o)}`}>{hex(o)}</button>)}</li>))}</ul>
      <H>Symbolic execution</H>
      <p className="text-muted">{SOLVER_LABEL[f.solver_status] ?? f.solver_status}</p>
      {f.path_conditions.length > 0 && <><p className="mt-2 text-xs text-muted">Path conditions ({f.path_conditions.length} shown):</p><pre className="mt-1 max-h-40 overflow-auto border border-line bg-ink/60 p-3 text-xs">{f.path_conditions.join('\n')}</pre></>}
      {Object.keys(f.witness).length > 0 && <><p className="mt-2 text-xs text-muted">Example inputs satisfying the modelled path (callee behaviour is not modelled):</p>
        <dl className="mono mt-1 grid grid-cols-[auto_1fr] gap-x-4 text-xs">{Object.entries(f.witness).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all">{String(v)}</dd></div>)}</dl></>}
      <H>Preconditions</H><List items={f.preconditions} />
      <H>Potential impact</H><p className="text-muted">{f.potential_impact}</p>
      <H>Suggested remediation</H><List items={f.remediation} />
      <H>Verification steps</H><List items={f.verification_steps} />
      <H>Known false-positive scenarios</H><List items={f.false_positive_considerations} />
      <H>Analysis limitations</H><List items={f.limitations} />
    </article>
  )
}
