import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { checkBytecode } from '../lib/validation'
import { Button, Notice, Pane, PaneTitle, Stat, hex } from '../components/ui'
import type { RuleGroup } from '../lib/types'

const Group = ({ title, g }: { title: string; g: RuleGroup[] }) => (
  <div><h3 className="text-sm font-semibold">{title}</h3>{g.length === 0 ? <p className="text-sm text-muted">None</p> : <ul className="text-sm text-muted">{g.map((x, i) => <li key={i} className="mono">{x.rule_id} · {x.severity} · {x.classification.replaceAll('_', ' ')}{x.count ? ` × ${x.count}` : ''}</li>)}</ul>}</div>
)

export default function Compare() {
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const ca = a ? checkBytecode(a) : null, cb = b ? checkBytecode(b) : null
  const m = useMutation({ mutationFn: () => api.compare({ original: a, updated: b, evm_revision: 'cancun' }) })
  const ok = ca?.ok && cb?.ok
  const box = (id: string, label: string, v: string, set: (s: string) => void, c: typeof ca) => (
    <div><label htmlFor={id} className="text-sm font-medium">{label}</label>
      <textarea id={id} rows={8} spellCheck={false} value={v} onChange={(e) => set(e.target.value)} className="mono mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm rounded-pane" placeholder="0x6080…" />
      <p className={'mt-1 text-xs ' + (c && !c.ok ? 'text-danger' : 'text-muted')} role={c && !c.ok ? 'alert' : undefined}>{c ? (c.ok ? `${c.bytes} bytes · valid hex` : c.error) : 'Runtime bytecode (hex)'}</p></div>)
  const d = m.data
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl">Compare two bytecodes</h1>
      <p className="mt-2 max-w-2xl text-muted">Byte-level and instruction-level differences, plus how findings changed. A finding disappearing does not show that an issue was fixed.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">{box('orig', 'Original', a, setA, ca)}{box('upd', 'Updated', b, setB, cb)}</div>
      <div className="mt-4"><Button variant="primary" disabled={!ok || m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Comparing…' : 'Compare'}</Button></div>
      {m.isError && <div className="mt-4"><Notice kind="error" title="Comparison failed">{(m.error as ApiError).message}</Notice></div>}
      {d && (
        <div className="mt-8 space-y-5">
          {d.identical ? <Notice title="Identical">The two bytecodes are byte-for-byte identical.</Notice> : <>
            <Pane><PaneTitle>Byte level</PaneTitle><dl className="grid grid-cols-2 sm:grid-cols-4"><Stat label="Original size" value={d.byte_level.original_size} /><Stat label="Updated size" value={d.byte_level.updated_size} /><Stat label="Size change" value={d.byte_level.size_delta} />
              <Stat label="First differing offset" value={d.byte_level.first_differing_offset === null ? '—' : hex(d.byte_level.first_differing_offset)} /></dl></Pane>
            <Pane><PaneTitle>Call and storage operations</PaneTitle><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="px-4 py-2">Opcode</th><th>Original</th><th>Updated</th></tr></thead>
              <tbody className="mono">{Object.entries(d.call_and_storage_op_counts).map(([k, v]) => <tr key={k} className="border-t border-line/60"><td className="px-4 py-1.5">{k}</td><td>{v.original}</td><td className={v.original !== v.updated ? 'text-amber' : ''}>{v.updated}{v.original !== v.updated ? ' (changed)' : ''}</td></tr>)}</tbody></table></Pane>
            <Pane><PaneTitle>Findings</PaneTitle><div className="grid gap-4 p-4 sm:grid-cols-3"><Group title="Added" g={d.findings.added_rule_groups} /><Group title="Removed" g={d.findings.removed_rule_groups} /><Group title="Unchanged" g={d.findings.unchanged_rule_groups} /></div></Pane>
            <Pane><PaneTitle aside={<span className="text-xs text-muted">{d.instruction_level.change_count} change(s){d.instruction_level.truncated ? ', first 200 returned' : ''}</span>}>Instruction-level changes</PaneTitle>
              <ul className="mono max-h-96 divide-y divide-line/60 overflow-auto text-xs">{d.instruction_level.changes.slice(0, 80).map((c, i) => (
                <li key={i} className="grid gap-2 px-4 py-2 sm:grid-cols-[5rem_1fr_1fr]"><span className="text-amber">{c.op}</span>
                  <span className="text-muted">{c.original.slice(0, 6).map((x) => `${hex(x.offset)} ${x.mnemonic}`).join(' ; ') || '—'}{c.original.length > 6 ? ' …' : ''}</span>
                  <span>{c.updated.slice(0, 6).map((x) => `${hex(x.offset)} ${x.mnemonic}`).join(' ; ') || '—'}{c.updated.length > 6 ? ' …' : ''}</span></li>))}</ul></Pane></>}
          <Notice title="Limitations"><ul className="list-disc pl-5">{d.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Notice>
        </div>)}
    </div>
  )
}
