import { lazy, Suspense, useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Copy, Download, Printer, X } from 'lucide-react'
import { getResult } from '../lib/store'
import { blocksForFinding } from '../lib/graph'
import type { AnalysisResult } from '../lib/types'
import { Button, ButtonLink, Empty, Notice, Pane, PaneTitle, SEVERITY_ORDER, SeverityBadge, Stat, cx } from '../components/ui'
import { FindingsPanel } from '../components/findings/FindingsPanel'
import { InstructionViewer } from '../components/evidence/InstructionViewer'
import { CoveragePanel } from '../components/reports/CoveragePanel'
import { SymbolicPanel } from '../components/reports/SymbolicPanel'

const EvidenceView = lazy(() => import('../components/evidence/EvidenceView').then((m) => ({ default: m.EvidenceView })))
const TABS = [['overview', 'Overview'], ['findings', 'Findings'], ['graph', 'Graph'], ['instructions', 'Instructions'], ['coverage', 'Coverage'], ['symbolic', 'Symbolic'], ['report', 'Report']] as const
type Tab = (typeof TABS)[number][0]
const STATUS = { completed: 'Completed', completed_with_limitations: 'Completed with limitations', cancelled: 'Cancelled' } as const

export default function Results() {
  const { id = '' } = useParams()
  const loc = useLocation()
  const result = useMemo<AnalysisResult | null>(() => (loc.state as { result?: AnalysisResult } | null)?.result ?? getResult(id), [id, loc.state])
  const stored = (loc.state as { stored?: boolean } | null)?.stored
  const [tab, setTab] = useState<Tab>('overview')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusOffset, setFocusOffset] = useState<number | null>(null)
  const focused = result?.findings.find((f) => f.id === focusedId) ?? null
  const hiOffsets = useMemo(() => new Set(focused?.offsets ?? []), [focused])
  if (!result) return <div className="mx-auto max-w-3xl px-4 py-16"><Empty title="Scan not found" action={<ButtonLink to="/scan" variant="primary">Start a new analysis</ButtonLink>}>This browser has no saved result with that id. Results are stored locally and only the 10 most recent are kept.</Empty></div>

  const onKey = (e: KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null
    if (n === null) return
    const t = TABS[(n + TABS.length) % TABS.length][0]; setTab(t); document.getElementById(`tab-${t}`)?.focus()
  }
  const counts = SEVERITY_ORDER.map((s) => [s, result.findings.filter((f) => f.severity === s).length] as const)
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `sentinel-${result.bytecode.sha256.slice(0, 12)}-${result.scan_id.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  const jump = (o: number) => { setFocusOffset(o); setTab('instructions') }
  const complete = result.status === 'completed'
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono text-xs text-muted">scan {result.scan_id} · {new Date(result.created_at).toLocaleString()}</p>
          <h1 className="mt-1 text-3xl">Analysis result</h1>
          <p className={cx('mt-2 inline-block border px-2 py-0.5 text-sm rounded-pane', complete ? 'border-ok/60 text-ok' : 'border-amber/60 text-amber')}>{STATUS[result.status]}</p>
        </div>
        <div className="no-print flex gap-2"><Button onClick={exportJson}><Download size={16} />JSON</Button><Button onClick={() => window.print()}><Printer size={16} />Print</Button><ButtonLink to="/scan" variant="primary">New analysis</ButtonLink></div>
      </header>
      {stored === false && <div className="mt-4"><Notice kind="warn" title="Not saved to history">The browser's storage is full or unavailable. Export the JSON to keep this result.</Notice></div>}
      {!complete && result.limitation_reasons.length > 0 && <div className="mt-4"><Notice kind="warn" title="Read these limits before relying on this result"><ul className="list-disc pl-5">{result.limitation_reasons.map((r) => <li key={r}>{r}</li>)}</ul></Notice></div>}

      {focused && <div className="no-print mt-4 flex items-center justify-between gap-3 border border-cyan/50 bg-cyan/5 px-4 py-2 text-sm rounded-pane"><span>Focused finding: <strong>{focused.title}</strong> <span className="mono text-xs text-muted">{focused.rule_id}</span></span>
        <button className="p-1 text-muted hover:text-fg" onClick={() => setFocusedId(null)} aria-label="Clear focused finding"><X size={16} /></button></div>}

      <div role="tablist" aria-label="Result sections" className="no-print mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label], i) => (
          <button key={k} id={`tab-${k}`} role="tab" aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} onKeyDown={(e) => onKey(e, i)} onClick={() => setTab(k)}
            className={cx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors duration-150', tab === k ? 'border-cyan text-cyan' : 'border-transparent text-muted hover:text-fg')}>
            {label}{k === 'findings' && <span className="mono ml-1.5 text-xs">({result.findings.length})</span>}</button>))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === 'overview' && (
          <div className="space-y-5">
            <Pane><PaneTitle>Summary</PaneTitle>
              <dl className="grid grid-cols-2 sm:grid-cols-4"><Stat label="Bytecode" value={`${result.bytecode.size_bytes} bytes`} /><Stat label="Instructions" value={result.coverage.decoding.instructions} /><Stat label="Basic blocks" value={result.coverage.structure.basic_blocks} />
                <Stat label="Symbolic execution" value={(result.symbolic_execution?.status ?? 'not run').replaceAll('_', ' ')} /></dl></Pane>
            <Pane><PaneTitle>Findings by severity</PaneTitle>
              <ul className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-4">{counts.map(([s, n]) => <li key={s} className="flex items-center gap-2"><SeverityBadge severity={s} /><span className="mono">{n}</span></li>)}</ul>
              {result.findings.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">No REENT-001 findings. That is not a statement that the contract is secure.</p>
                : <p className="px-4 pb-4 text-sm"><button className="text-cyan underline-offset-4 hover:underline" onClick={() => setTab('findings')}>Review findings</button></p>}</Pane>
            <Pane><PaneTitle>What this analysis did not cover</PaneTitle><ul className="list-disc space-y-1 px-8 py-4 text-sm text-muted">{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Pane>
          </div>)}
        {tab === 'findings' && <FindingsPanel result={result} focusedId={focusedId} onFocus={setFocusedId} onJump={jump} />}
        {tab === 'graph' && <Suspense fallback={<p className="text-muted">Loading graph…</p>}><EvidenceView result={result} finding={focused} /></Suspense>}
        {tab === 'instructions' && <InstructionViewer instructions={result.instructions} highlight={hiOffsets} focusOffset={focusOffset} />}
        {tab === 'coverage' && <CoveragePanel result={result} />}
        {tab === 'symbolic' && <SymbolicPanel result={result} />}
        {tab === 'report' && <ReportTab result={result} onExport={exportJson} />}
      </div>
      <p className="mt-10 text-xs text-muted">Highlight data for a focused finding comes from the engine's evidence ({focused ? blocksForFinding(result, focused).size : 0} block(s) currently). <Link to="/methodology" className="text-cyan">How findings are produced</Link></p>
    </div>
  )
}

function ReportTab({ result, onExport }: { result: AnalysisResult; onExport: () => void }) {
  const [copied, setCopied] = useState(false)
  const fp = result.fingerprint
  const copy = () => navigator.clipboard?.writeText(fp.input_fingerprint_sha256).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  return (
    <div className="space-y-5">
      <Pane><PaneTitle>Reproducibility fingerprint</PaneTitle><div className="space-y-3 p-4 text-sm">
        <div><p className="text-xs text-muted">Input fingerprint (bytecode + versions + configuration)</p><p className="mono break-all">{fp.input_fingerprint_sha256} <button className="ml-2 text-cyan" onClick={copy} aria-label="Copy input fingerprint"><Copy size={14} className="inline" /> {copied ? 'copied' : ''}</button></p></div>
        <div><p className="text-xs text-muted">Result fingerprint</p><p className="mono break-all">{fp.result_fingerprint_sha256}</p></div>
        <div><p className="text-xs text-muted">Bytecode SHA-256</p><p className="mono break-all">{result.bytecode.sha256}</p></div>
        <p className="text-muted">{fp.reproducibility_note}</p>
        <dl className="mono grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><dt className="text-muted">analyzer</dt><dd>{result.analyzer_version}</dd></div><div><dt className="text-muted">rule set</dt><dd>{result.rule_set_version}</dd></div><div><dt className="text-muted">EVM revision</dt><dd>{result.bytecode.evm_revision}</dd></div></dl></div></Pane>
      <Pane><PaneTitle>Configuration</PaneTitle><pre className="overflow-auto p-4 text-xs">{JSON.stringify(result.configuration, null, 2)}</pre></Pane>
      <Pane><PaneTitle>Rules executed</PaneTitle><div className="divide-y divide-line">{Object.entries(result.rules).map(([id, r]) => (
        <div key={id} className="space-y-2 p-4 text-sm"><p><span className="mono text-cyan">{id}</span> v{r.version} · {r.title}</p><p className="text-muted">{r.description}</p>
          <p className="text-xs text-muted">Known limitations: {r.limitations.join(' ')}</p></div>))}</div></Pane>
      <Pane><PaneTitle>Export</PaneTitle><div className="flex flex-wrap items-center gap-3 p-4"><Button variant="primary" onClick={onExport}><Download size={16} />Download JSON report</Button><Button onClick={() => window.print()}><Printer size={16} />Print / save as PDF</Button>
        <p className="text-xs text-muted">Server-side PDF generation is not implemented; "Print" uses your browser's save-as-PDF.</p></div></Pane>
    </div>
  )
}
