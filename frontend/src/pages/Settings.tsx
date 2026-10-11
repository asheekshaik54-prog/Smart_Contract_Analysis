import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSettings, type Settings } from '../app/settings'
import { API_BASE, api } from '../lib/api'
import { clearHistory, listHistory } from '../lib/store'
import { Button, Pane, PaneTitle, cx } from '../components/ui'

function Radio<K extends keyof Settings>({ name, label, options, help }: { name: K; label: string; options: [Settings[K], string][]; help?: string }) {
  const { settings, set } = useSettings()
  return (
    <fieldset className="p-4"><legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">{options.map(([v, l]) => (
        <label key={String(v)} className={cx('cursor-pointer border px-3 py-1.5 text-sm rounded-pane transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan', settings[name] === v ? 'border-cyan text-cyan' : 'border-line text-muted hover:text-fg')}>
          <input type="radio" name={name} className="sr-only" checked={settings[name] === v} onChange={() => set({ [name]: v } as Partial<Settings>)} />{l}</label>))}</div>
      {help && <p className="mt-2 text-xs text-muted">{help}</p>}</fieldset>
  )
}

export default function SettingsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false })
  const cap = useQuery({ queryKey: ['capabilities'], queryFn: api.capabilities, retry: false })
  const [confirm, setConfirm] = useState(false)
  const [n, setN] = useState(listHistory().length)
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl">Settings</h1>
      <p className="mt-2 text-muted">Stored in this browser only.</p>
      <div className="mt-8 space-y-5">
        <Pane><PaneTitle>Appearance</PaneTitle>
          <Radio name="theme" label="Theme" options={[['dark', 'Dark'], ['light', 'Light']]} />
          <Radio name="motion" label="Motion" options={[['system', 'Follow system'], ['full', 'Full'], ['reduced', 'Reduced']]} help="Reduced turns off CSS transitions and animation and freezes 3D movement. Follow system uses your OS reduced-motion setting." />
          <Radio name="threeD" label="3D visuals" options={[['auto', 'Automatic'], ['off', 'Off']]} help="Off replaces the 3D hero and 3D evidence view with 2D equivalents. Automatic also falls back if WebGL is unavailable or the device looks low-power." /></Pane>
        <Pane><PaneTitle>Service</PaneTitle>
          <dl className="mono grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 p-4 text-sm">
            <dt className="text-muted">API base</dt><dd>{API_BASE || '(same origin / dev proxy)'}</dd>
            <dt className="text-muted">Status</dt><dd>{health.isLoading ? 'checking…' : health.isError ? 'unreachable' : health.data?.status}</dd>
            <dt className="text-muted">Analyzer</dt><dd>{cap.data?.analyzer_version ?? '—'}</dd>
            <dt className="text-muted">Rules</dt><dd>{cap.data?.rules.join(', ') ?? '—'}</dd>
            <dt className="text-muted">Server persistence</dt><dd>{cap.data ? String(cap.data.persistence) : '—'}</dd>
            <dt className="text-muted">RPC retrieval</dt><dd>{cap.data ? String(cap.data.rpc_retrieval) : '—'}</dd></dl></Pane>
        <Pane><PaneTitle>Local data</PaneTitle><div className="flex flex-wrap items-center gap-3 p-4"><p className="text-sm text-muted">{n} saved scan(s) in this browser.</p>
          {!confirm ? <Button variant="danger" disabled={n === 0} onClick={() => setConfirm(true)}>Delete saved scans</Button>
            : <><Button variant="danger" onClick={() => { clearHistory(); setN(0); setConfirm(false) }}>Confirm delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></>}</div></Pane>
      </div>
    </div>
  )
}
