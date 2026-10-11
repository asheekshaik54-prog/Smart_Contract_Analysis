import { lazy, Suspense, useMemo, useState } from 'react'
import { RotateCcw, Box, Network } from 'lucide-react'
import { useSettings } from '../../app/settings'
import { hasWebGL } from '../../lib/webgl'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Button, Notice, hex } from '../ui'
import CfgGraph from './CfgGraph'
import type { AnalysisResult, Finding } from '../../lib/types'
import { blocksForFinding } from '../../lib/graph'

const EvidenceScene = lazy(() => import('../three/EvidenceScene'))

export function EvidenceView({ result, finding }: { result: AnalysisResult; finding: Finding | null }) {
  const { settings, reducedMotion } = useSettings()
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [selected, setSelected] = useState<number | null>(null)
  const [isolate, setIsolate] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const { blocks, edges } = result.cfg
  const highlight = useMemo(() => (finding ? blocksForFinding(result, finding) : new Set<number>()), [result, finding])
  const can3d = settings.threeD !== 'off' && hasWebGL() && !failed
  const sel = blocks.find((b) => b.start === selected) ?? null
  const selIns = useMemo(() => (sel ? result.instructions.filter((i) => i.offset >= sel.start && i.offset <= sel.end) : []), [sel, result.instructions])
  const rows = useMemo(() => {
    const out = new Map<number, string[]>()
    for (const e of edges) { if (!out.has(e.src)) out.set(e.src, []); out.get(e.src)!.push(`${e.kind} → ${hex(e.dst)}`) }
    const needle = q.trim().toLowerCase()
    return blocks.filter((b) => !needle || hex(b.start).includes(needle) || hex(b.end).includes(needle)).map((b) => ({ b, succ: out.get(b.start) ?? [] }))
  }, [blocks, edges, q])

  if (blocks.length === 0) return <Notice title="No control-flow data">The engine returned no basic blocks for this bytecode.</Notice>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Graph view" className="flex">
          <Button variant="outline" aria-pressed={mode === '2d'} onClick={() => setMode('2d')} className={mode === '2d' ? 'border-cyan text-cyan' : ''}><Network size={16} />2D graph</Button>
          <Button variant="outline" aria-pressed={mode === '3d'} disabled={!can3d} onClick={() => setMode('3d')} className={mode === '3d' ? 'border-cyan text-cyan' : ''}><Box size={16} />3D view</Button>
        </div>
        {mode === '3d' && <>
          <Button onClick={() => setResetKey((k) => k + 1)}><RotateCcw size={16} />Reset camera</Button>
          <Button aria-pressed={isolate} disabled={!finding} onClick={() => setIsolate(!isolate)} className={isolate ? 'border-cyan text-cyan' : ''}>Isolate focused finding</Button>
        </>}
        <span className="text-xs text-muted">{finding ? `Highlighting ${highlight.size} block(s) for the focused finding.` : 'Focus a finding in the Findings tab to highlight its blocks.'}</span>
      </div>
      {!can3d && <Notice>3D view is unavailable ({settings.threeD === 'off' ? 'disabled in Settings' : failed ? 'WebGL failed' : 'WebGL not supported in this browser'}). The 2D graph and text list show the same data.</Notice>}
      {mode === '3d' && can3d ? (
        <div className="relative h-[520px] border border-line rounded-pane bg-ink/60" role="group" aria-label="3D control-flow view. A text alternative follows.">
          <ErrorBoundary onError={() => { setFailed(true); setMode('2d') }} fallback={<Notice kind="error" title="3D view failed">Use the 2D graph.</Notice>}>
            <Suspense fallback={<p className="p-6 text-muted">Loading 3D view…</p>}>
              <EvidenceScene blocks={blocks} edges={edges} highlight={highlight} selected={selected} onSelect={setSelected} isolate={isolate}
                resetKey={resetKey} reduced={reducedMotion} onFail={() => { setFailed(true); setMode('2d') }} />
            </Suspense>
          </ErrorBoundary>
          <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-muted">Drag to rotate · scroll to zoom · click a node. Octahedra end in an unresolved dynamic jump; amber = focused finding.</p>
        </div>
      ) : <CfgGraph blocks={blocks} edges={edges} highlight={highlight} selected={selected} onSelect={setSelected} theme={settings.theme} />}

      {sel && (
        <section className="border border-line rounded-pane p-4" aria-live="polite">
          <h3 className="text-sm font-semibold">Block {hex(sel.start)}–{hex(sel.end)}{highlight.has(sel.start) && <span className="ml-2 text-amber">evidence for focused finding</span>}</h3>
          {sel.unresolved_jump && <p className="text-xs text-amber">Ends in a dynamic jump whose target the engine could not resolve; no outgoing edge was invented.</p>}
          <p className="mono mt-2 text-xs text-muted">{(rows.find((r) => r.b.start === sel.start)?.succ ?? []).join(' · ') || 'no resolved successors'}</p>
          <ol className="mono mt-2 max-h-48 overflow-auto text-xs">{selIns.slice(0, 80).map((i) => <li key={i.offset}><span className="text-muted">{hex(i.offset)}</span> {i.mnemonic} <span className="text-cyan">{i.immediate && '0x' + i.immediate}</span></li>)}</ol>
        </section>
      )}

      <details className="border border-line rounded-pane">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Text alternative: all {blocks.length} basic blocks and resolved edges</summary>
        <div className="border-t border-line p-4">
          <label className="text-xs text-muted" htmlFor="blk-search">Search by offset</label>
          <input id="blk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 0x1a" className="mono mb-3 block w-full max-w-xs border border-line bg-ink px-3 py-2 text-sm rounded-pane" />
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs"><caption className="sr-only">Basic blocks</caption>
              <thead className="text-muted"><tr><th className="py-1 pr-3">Block</th><th className="pr-3">Evidence</th><th>Resolved successors</th></tr></thead>
              <tbody className="mono">{rows.map(({ b, succ }) => (
                <tr key={b.start} className="border-t border-line/60">
                  <td className="py-1 pr-3"><button className="text-cyan underline-offset-2 hover:underline" onClick={() => setSelected(b.start)}>{hex(b.start)}–{hex(b.end)}</button></td>
                  <td className="pr-3">{highlight.has(b.start) ? 'yes' : ''}</td>
                  <td>{succ.join(', ')}{b.unresolved_jump ? (succ.length ? ', ' : '') + 'UNRESOLVED dynamic jump' : ''}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  )
}
