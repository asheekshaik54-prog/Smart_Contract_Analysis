import { useEffect, useMemo, useState } from 'react'
import type { Instruction } from '../../lib/types'
import { hex } from '../ui'

const PAGE = 150
export function InstructionViewer({ instructions, highlight, focusOffset }: { instructions: Instruction[]; highlight: Set<number>; focusOffset: number | null }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [go, setGo] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = useMemo(() => (needle ? instructions.filter((i) => i.mnemonic.toLowerCase().includes(needle) || hex(i.offset) === needle || i.status.includes(needle)) : instructions), [instructions, needle])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const idxOf = (off: number) => { let lo = 0, hi = rows.length - 1, best = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].offset <= off) { best = m; lo = m + 1 } else hi = m - 1 } return best }
  const goto = (off: number) => { const i = idxOf(off); setPage(Math.floor(i / PAGE)); requestAnimationFrame(() => document.getElementById(`ins-${rows[i]?.offset}`)?.scrollIntoView({ block: 'center' })) }
  useEffect(() => { if (focusOffset != null && !needle) goto(focusOffset) /* eslint-disable-next-line */ }, [focusOffset])
  useEffect(() => setPage(0), [needle])
  const view = rows.slice(page * PAGE, (page + 1) * PAGE)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div><label htmlFor="ins-q" className="block text-xs text-muted">Filter (mnemonic, exact offset, status)</label>
          <input id="ins-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="CALL, SSTORE, 0x2a…" className="mono block w-56 border border-line bg-ink px-3 py-2 text-sm rounded-pane" /></div>
        <form onSubmit={(e) => { e.preventDefault(); const n = Number(go.trim().startsWith('0x') ? go.trim() : go.trim().length ? '0x' + go.trim() : NaN); if (Number.isFinite(n)) goto(n) }}>
          <label htmlFor="ins-go" className="block text-xs text-muted">Go to offset (hex)</label>
          <input id="ins-go" value={go} onChange={(e) => setGo(e.target.value)} placeholder="0x1a4" className="mono block w-32 border border-line bg-ink px-3 py-2 text-sm rounded-pane" /></form>
        <p className="text-xs text-muted">{rows.length} of {instructions.length} instructions · page {page + 1}/{pages}</p>
      </div>
      <div className="max-h-[560px] overflow-auto border border-line rounded-pane">
        <table className="mono w-full text-left text-xs">
          <caption className="sr-only">Decoded instructions. Rows marked "evidence" belong to the focused finding.</caption>
          <thead className="sticky top-0 bg-panel text-muted"><tr><th className="px-3 py-2 w-16">Evidence</th><th className="px-3">Offset</th><th className="px-3">Instruction</th><th className="px-3">Immediate</th><th className="px-3">Status</th></tr></thead>
          <tbody>{view.map((i) => {
            const hi = highlight.has(i.offset), bad = i.status !== 'valid'
            return <tr key={i.offset} id={`ins-${i.offset}`} className={hi ? 'bg-amber/10' : ''} style={hi ? { boxShadow: 'inset 3px 0 rgb(var(--amber))' } : undefined}>
              <td className="px-3 py-1 text-amber">{hi ? '● yes' : ''}</td><td className="px-3 text-muted">{hex(i.offset)}</td>
              <td className={'px-3 ' + (bad ? 'text-danger' : 'text-fg')}>{i.mnemonic}</td>
              <td className="max-w-[28rem] truncate px-3 text-cyan" title={i.immediate}>{i.immediate && '0x' + i.immediate}</td>
              <td className={'px-3 ' + (bad ? 'text-danger' : 'text-muted')}>{bad ? i.status.replaceAll('_', ' ') : ''}</td></tr>
          })}</tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        <button className="border border-line px-3 py-1 rounded-pane disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <button className="border border-line px-3 py-1 rounded-pane disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  )
}
