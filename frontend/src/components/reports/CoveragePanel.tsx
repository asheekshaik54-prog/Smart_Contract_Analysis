import type { AnalysisResult } from '../../lib/types'
import { Pane, PaneTitle, Stat, hex } from '../ui'

export function CoveragePanel({ result }: { result: AnalysisResult }) {
  const { decoding: d, structure: s, security_analysis: a } = result.coverage
  const parts = [['Valid', d.valid, 'bg-cyan'], ['Unknown opcode', d.unknown_opcodes, 'bg-danger'], ['Unavailable in revision', d.unavailable_in_revision, 'bg-amber'], ['Truncated PUSH', d.truncated_push, 'bg-violet']] as const
  return (
    <div className="space-y-5">
      <Pane><PaneTitle>Decoding coverage</PaneTitle>
        <dl className="grid grid-cols-2 sm:grid-cols-4"><Stat label="Bytes" value={d.bytes} /><Stat label="Instructions" value={d.instructions} /><Stat label="Valid" value={d.valid} /><Stat label="Unsupported" value={d.unknown_opcodes + d.unavailable_in_revision + d.truncated_push} /></dl>
        <div className="px-4 pb-4">
          <div className="flex h-3 overflow-hidden border border-line" role="img" aria-label={parts.map(([n, v]) => `${n}: ${v}`).join(', ')}>
            {parts.map(([n, v, c]) => v > 0 && <div key={n} className={c} style={{ width: `${(v / Math.max(1, d.instructions)) * 100}%` }} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 text-xs text-muted">{parts.map(([n, v, c]) => <li key={n}><span className={`mr-1.5 inline-block h-2 w-2 ${c}`} aria-hidden />{n}: <span className="mono text-fg">{v}</span></li>)}</ul>
          {d.unsupported_offsets.length > 0 && <p className="mono mt-3 text-xs text-muted">Offsets: {d.unsupported_offsets.slice(0, 40).map(hex).join(' ')}{d.unsupported_offsets.length > 40 ? ' …' : ''} (compiler metadata at the end of the code usually shows up here)</p>}
          <p className="mt-3 text-xs text-muted">{d.note}</p></div></Pane>
      <Pane><PaneTitle>Structural coverage</PaneTitle>
        <dl className="grid grid-cols-2 sm:grid-cols-4"><Stat label="Basic blocks" value={s.basic_blocks} /><Stat label="Resolved edges" value={s.edges} />
          <Stat label="Blocks reached from entry" value={`${s.blocks_reachable_from_entry_via_resolved_edges} / ${s.basic_blocks}`} /><Stat label="Unresolved dynamic jumps" value={s.unresolved_dynamic_jumps.length} /></dl>
        <div className="px-4 pb-4 text-xs text-muted">
          {s.unresolved_dynamic_jumps.length > 0 && <p className="mono">Jump offsets: {s.unresolved_dynamic_jumps.slice(0, 40).map(hex).join(' ')}</p>}
          {s.invalid_constant_jump_targets.length > 0 && <p className="mono">Constant jumps to non-JUMPDEST: {s.invalid_constant_jump_targets.map((j) => `${hex(j.jump)}→${hex(j.target)}`).join(' ')}</p>}
          <p className="mt-2">{s.note}</p></div></Pane>
      <Pane><PaneTitle>Security-analysis coverage</PaneTitle>
        <dl className="grid grid-cols-2 sm:grid-cols-3"><Stat label="Rules executed" value={a.rules_executed.join(', ')} /><Stat label="External call sites" value={a.external_call_sites.length} />
          <Stat label="Symbolic execution" value={a.symbolic_execution.replaceAll('_', ' ')} /></dl>
        <div className="px-4 pb-4 text-xs text-muted">
          {a.external_call_sites.length > 0 && <p className="mono">{a.external_call_sites.map((c) => `${c.mnemonic}@${hex(c.offset)}`).join('  ')}</p>}
          {a.unanalysed_call_kinds.length > 0 && <p className="mt-1 text-amber">{a.unanalysed_call_kinds.join(', ')} present but not analysed by REENT-001.</p>}
          <p className="mt-2">{a.note} High decoding coverage does not mean all relevant vulnerabilities were checked.</p></div></Pane>
    </div>
  )
}
