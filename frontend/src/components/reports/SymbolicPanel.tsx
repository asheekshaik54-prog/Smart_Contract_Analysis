import type { AnalysisResult } from '../../lib/types'
import { Notice, Pane, PaneTitle, Stat, hex } from '../ui'

const STATUS: Record<string, string> = { complete_within_model: 'Complete within the model', incomplete: 'Incomplete', cancelled: 'Cancelled' }
export function SymbolicPanel({ result }: { result: AnalysisResult }) {
  const s = result.symbolic_execution
  if (!s) return <Notice title="Symbolic execution was not run">This scan was run with symbolic execution turned off.</Notice>
  return (
    <div className="space-y-5">
      <Pane><PaneTitle>Outcome</PaneTitle>
        <dl className="grid grid-cols-2 sm:grid-cols-4"><Stat label="Status" value={STATUS[s.status] ?? s.status} /><Stat label="Instructions executed" value={s.steps} /><Stat label="Paths started" value={s.paths_started} /><Stat label="Modelled call→SSTORE paths" value={s.call_then_sstore_paths.length} /></dl>
        <p className="px-4 pb-4 text-xs text-muted">"Complete within the model" means every modelled path ended normally; it does not mean the contract was fully verified. A satisfiable path is not proof of exploitability.</p></Pane>
      <Pane><PaneTitle>How paths ended</PaneTitle>
        <table className="w-full text-left text-sm"><caption className="sr-only">Path terminations</caption>
          <thead className="text-xs text-muted"><tr><th className="px-4 py-2">Category : reason</th><th className="px-4">Paths</th></tr></thead>
          <tbody className="mono">{Object.entries(s.terminations).map(([k, v]) => <tr key={k} className="border-t border-line/60"><td className={'px-4 py-1.5 ' + (/^(limit|unsupported|solver)/.test(k) ? 'text-amber' : '')}>{k}</td><td className="px-4">{v}</td></tr>)}</tbody></table>
        {Object.keys(s.unsupported_opcodes).length > 0 && <p className="px-4 py-3 text-sm text-amber">Unmodelled opcodes encountered: {Object.entries(s.unsupported_opcodes).map(([k, v]) => `${k} (${v})`).join(', ')}. Paths through them were stopped, not approximated.</p>}</Pane>
      {s.call_then_sstore_paths.length > 0 && <Pane><PaneTitle>Modelled paths: external CALL then SSTORE</PaneTitle>
        <ul className="divide-y divide-line/60">{s.call_then_sstore_paths.map((p) => <li key={`${p.call_offset}-${p.sstore_offset}`} className="px-4 py-3 text-sm"><span className="mono">CALL {hex(p.call_offset)} → SSTORE {hex(p.sstore_offset)}</span> <span className="text-muted">({p.path_condition_count} branch constraints; {p.status.replaceAll('_', ' ')})</span></li>)}</ul></Pane>}
      <Pane><PaneTitle>Configuration and limits used</PaneTitle><dl className="mono grid grid-cols-2 gap-x-6 px-4 py-3 text-xs sm:grid-cols-3">{Object.entries(s.config).map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}</dl></Pane>
      <Pane><PaneTitle>Model assumptions</PaneTitle><ul className="list-disc space-y-1 px-8 py-3 text-sm text-muted">{s.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></Pane>
    </div>
  )
}
