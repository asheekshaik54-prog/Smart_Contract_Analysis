import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { clearHistory, deleteResult, listHistory } from '../lib/store'
import { Button, ButtonLink, Empty, Notice } from '../components/ui'

export default function History() {
  const [items, setItems] = useState(listHistory)
  const refresh = () => setItems(listHistory())
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-3xl">Scan history</h1>
        {items.length > 0 && <Button variant="danger" onClick={() => { clearHistory(); refresh() }}><Trash2 size={16} />Delete all</Button>}</div>
      <div className="mt-4"><Notice>History is stored only in this browser (localStorage) and keeps the 10 most recent scans. The backend has no database yet, so nothing is shared or synced.</Notice></div>
      {items.length === 0 ? <div className="mt-8"><Empty title="No scans yet" action={<ButtonLink to="/scan" variant="primary">Run your first analysis</ButtonLink>}>Scans you run appear here. Nothing is pre-filled.</Empty></div> : (
        <div className="mt-6 overflow-x-auto border border-line rounded-pane">
          <table className="w-full text-left text-sm"><caption className="sr-only">Saved scans</caption>
            <thead className="bg-panel text-xs text-muted"><tr><th className="px-4 py-2">When</th><th>Bytecode SHA-256</th><th>Size</th><th>Revision</th><th>Status</th><th>Findings</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{items.map((e) => (
              <tr key={e.id} className="border-t border-line/60"><td className="px-4 py-2">{new Date(e.created_at).toLocaleString()}</td><td className="mono">{e.sha256.slice(0, 16)}…</td><td className="mono">{e.size_bytes} B</td><td>{e.revision}</td><td>{e.status.replaceAll('_', ' ')}</td><td className="mono">{e.findings}</td>
                <td className="space-x-3 whitespace-nowrap px-4"><Link to={`/results/${e.id}`} className="text-cyan hover:underline">Open</Link>
                  <button className="text-danger hover:underline" onClick={() => { deleteResult(e.id); refresh() }} aria-label={`Delete scan ${e.id.slice(0, 8)}`}>Delete</button></td></tr>))}</tbody></table></div>)}
    </div>
  )
}
