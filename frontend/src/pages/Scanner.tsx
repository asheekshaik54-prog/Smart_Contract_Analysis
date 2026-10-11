import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { saveResult } from '../lib/store'
import { checkBytecode, sha256Hex } from '../lib/validation'
import { Button, Notice, Pane, PaneTitle, cx } from '../components/ui'
import vulnerable from '../samples/VulnerableBank.opt1.hex?raw'
import safe from '../samples/SafeBank.opt1.hex?raw'
import guarded from '../samples/GuardedBank.opt1.hex?raw'

const REVISIONS_FALLBACK = ['homestead', 'byzantium', 'constantinople', 'istanbul', 'berlin', 'london', 'paris', 'shanghai', 'cancun']
const int = (min: number, max: number) => z.number({ message: 'Enter a number' }).int().min(min, `Min ${min}`).max(max, `Max ${max}`)
const schema = z.object({
  bytecode: z.string().superRefine((v, ctx) => { const c = checkBytecode(v); if (!c.ok) ctx.addIssue({ code: 'custom', message: c.error }) }),
  revision: z.string(), runSymbolic: z.boolean(),
  max_paths: int(1, 2048), max_steps: int(1, 200_000), max_depth: int(1, 10_000), max_jumpdest_visits: int(1, 20),
  solver_timeout_ms: int(50, 10_000), max_seconds: z.number({ message: 'Enter a number' }).gt(0).max(60, 'Max 60'),
})
type Form = z.infer<typeof schema>
const SAMPLES = [['VulnerableBank (-O1)', vulnerable], ['SafeBank (-O1)', safe], ['GuardedBank (-O1)', guarded]] as const

function ScannerCore({ state }: { state: 'idle' | 'running' | 'error' }) {
  return (
    <svg viewBox="-60 -60 120 120" className="mx-auto h-28 w-28" aria-hidden>
      <g fill="none" stroke="rgb(var(--cyan))" strokeWidth="1.5">
        <circle r="48" strokeDasharray="3 7" className={state === 'running' ? 'spin-fast' : 'spin-slow'} opacity=".7" />
        <path d="M0-28l24 14v28L0 28-24 14v-28z" stroke={state === 'error' ? 'rgb(var(--red))' : 'rgb(var(--cyan))'} strokeWidth="2" />
      </g>
      <circle r={state === 'running' ? 7 : 5} fill={state === 'error' ? 'rgb(var(--red))' : 'rgb(var(--violet))'} />
    </svg>
  )
}

export default function Scanner() {
  const nav = useNavigate()
  const cap = useQuery({ queryKey: ['capabilities'], queryFn: api.capabilities, retry: false })
  const { register, handleSubmit, watch, setValue, formState: { errors, isValid } } = useForm<Form>({
    resolver: zodResolver(schema), mode: 'onChange',
    defaultValues: { bytecode: '', revision: 'cancun', runSymbolic: true, max_paths: 256, max_steps: 50_000, max_depth: 2_000, max_jumpdest_visits: 3, solver_timeout_ms: 2_000, max_seconds: 20 },
  })
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fileMsg, setFileMsg] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const raw = watch('bytecode')
  const check = useMemo(() => checkBytecode(raw), [raw])
  const [hash, setHash] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (!check.ok) { setHash(null); return }
    const t = setTimeout(() => { sha256Hex(check.hex).then((h) => live && setHash(h)) }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [check])

  const onSubmit = handleSubmit(async (v) => {
    const c = checkBytecode(v.bytecode); if (!c.ok) return
    setError(null); setState('running')
    abort.current = new AbortController()
    try {
      const res = await api.analyze({ bytecode: '0x' + c.hex, evm_revision: v.revision, run_symbolic: v.runSymbolic,
        limits: { max_paths: v.max_paths, max_steps: v.max_steps, max_depth: v.max_depth, max_jumpdest_visits: v.max_jumpdest_visits, solver_timeout_ms: v.solver_timeout_ms, max_seconds: v.max_seconds } }, abort.current.signal)
      const { stored } = saveResult(res)
      nav(`/results/${res.scan_id}`, { state: { result: res, stored } })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'aborted') { setState('idle'); setError('Cancelled. The server may still finish the run in the background within its limits.'); return }
      setState('error'); setError(e instanceof ApiError ? `${e.message}${e.code && e.code !== 'unreachable' ? ` (${e.code})` : ''}` : 'Unexpected error.')
    }
  })

  const onFile = async (f: File | undefined) => {
    setFileMsg(null); if (!f) return
    if (f.size > 100_000) { setFileMsg('File is larger than 100 KB; only hex text files up to that size are accepted.'); return }
    const text = await f.text()
    setValue('bytecode', text.trim(), { shouldValidate: true, shouldDirty: true })
    setFileMsg(`Loaded ${f.name}`)
  }
  const revisions = cap.data?.evm_revisions ?? REVISIONS_FALLBACK
  const field = 'mono block w-full border border-line bg-ink px-3 py-2 text-sm rounded-pane'
  const num = (k: keyof Form, label: string) => (
    <div key={k}><label className="text-xs text-muted" htmlFor={k}>{label}</label>
      <input id={k} type="number" step="any" className={cx(field, errors[k] && 'border-danger')} {...register(k as 'max_paths', { valueAsNumber: true })} />
      {errors[k] && <p className="text-xs text-danger" role="alert">{errors[k]?.message as string}</p>}</div>)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl">Analyze runtime bytecode</h1>
      <p className="mt-2 max-w-2xl text-muted">Paste EVM <em>runtime</em> bytecode (not constructor/creation code). Analysis runs on the Sentinel backend; nothing is sent anywhere else.</p>
      {cap.isError && <div className="mt-5"><Notice kind="warn" title="Analysis API not reachable">Start the backend: <code className="mono">uvicorn app.api.main:app --reload</code> in the <code className="mono">backend</code> folder, then reload this page.</Notice></div>}
      <form onSubmit={onSubmit} className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]" noValidate>
        <div className="space-y-5">
          <Pane>
            <PaneTitle aside={<label className="flex cursor-pointer items-center gap-2 text-xs text-cyan"><Upload size={14} />Upload hex file<input type="file" accept=".hex,.txt,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label>}>Bytecode</PaneTitle>
            <div className="p-4">
              <label htmlFor="bytecode" className="sr-only">Runtime bytecode (hex)</label>
              <textarea id="bytecode" rows={10} spellCheck={false} placeholder="0x6080604052…" className={cx(field, 'resize-y', raw && !check.ok && 'border-danger')} aria-invalid={raw ? !check.ok : undefined} aria-describedby="bc-help" {...register('bytecode')} />
              <p id="bc-help" className={cx('mt-2 text-xs', raw && !check.ok ? 'text-danger' : 'text-muted')} role={raw && !check.ok ? 'alert' : undefined}>
                {!raw ? 'Hex digits, optional 0x prefix, no spaces. Maximum 24,576 bytes.' : check.ok ? `${check.bytes} bytes · valid hex` : check.error}</p>
              {fileMsg && <p className="text-xs text-muted">{fileMsg}</p>}
              <div className="mt-4 border-t border-line pt-3"><p className="text-xs text-muted">Test fixtures, compiled from <code className="mono">contracts/samples</code> with solc 0.8.26. Loading one only fills the box; nothing runs until you press Start.</p>
                <div className="mt-2 flex flex-wrap gap-2">{SAMPLES.map(([n, h]) => <Button key={n} className="px-3 py-1.5 text-xs" onClick={() => setValue('bytecode', h.trim(), { shouldValidate: true, shouldDirty: true })}>Load {n}</Button>)}</div></div>
            </div>
          </Pane>
          <Pane>
            <PaneTitle>Options</PaneTitle>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div><label htmlFor="revision" className="text-xs text-muted">EVM revision</label>
                <select id="revision" className={field} {...register('revision')}>{revisions.map((r) => <option key={r}>{r}</option>)}</select></div>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" {...register('runSymbolic')} className="h-4 w-4 accent-cyan" />Run symbolic execution (Z3)</label>
              <div className="sm:col-span-2 opacity-60"><label htmlFor="addr" className="text-xs text-muted">Contract address (not available)</label>
                <input id="addr" disabled className={field} placeholder="0x…" aria-describedby="addr-help" />
                <p id="addr-help" className="text-xs text-muted">Fetching deployed bytecode over RPC is not implemented yet, so there is no network selector either.</p></div>
            </div>
            <details className="border-t border-line"><summary className="cursor-pointer px-4 py-3 text-sm">Execution limits</summary>
              <div className="grid gap-4 p-4 pt-0 sm:grid-cols-3">{num('max_paths', 'Max paths')}{num('max_steps', 'Max instructions (total)')}{num('max_depth', 'Max depth per path')}{num('max_jumpdest_visits', 'Loop bound (JUMPDEST visits)')}{num('solver_timeout_ms', 'Solver timeout (ms)')}{num('max_seconds', 'Wall-clock limit (s)')}</div></details>
          </Pane>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Pane className="p-4">
            <ScannerCore state={state} />
            <p role="status" aria-live="polite" className="mt-2 text-center text-sm">{state === 'running' ? 'Analysis running' : state === 'error' ? 'Analysis failed' : 'Ready'}</p>
            {state === 'running' && <p className="mt-1 text-center text-xs text-muted">The backend does not report per-stage progress, so none is shown.</p>}
            <dl className="mono mt-4 space-y-1 text-xs"><div className="flex justify-between gap-2"><dt className="text-muted">Size</dt><dd>{check.ok ? `${check.bytes} bytes` : '—'}</dd></div>
              <div><dt className="text-muted">SHA-256 (computed in your browser)</dt><dd className="break-all">{hash ?? '—'}</dd></div></dl>
            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" className="flex-1" disabled={!isValid || state === 'running'}>Start analysis</Button>
              {state === 'running' && <Button variant="danger" onClick={() => abort.current?.abort()}>Cancel</Button>}
            </div>
            <p className="mt-2 text-xs text-muted">Cancel stops waiting for the result.</p>
          </Pane>
          {error && <Notice kind={state === 'error' ? 'error' : 'info'} title={state === 'error' ? 'Analysis failed' : undefined}>{error}</Notice>}
        </aside>
      </form>
    </div>
  )
}
