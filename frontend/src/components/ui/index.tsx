import { Link, type LinkProps } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react'
import type { Classification, Severity } from '../../lib/types'

export const hex = (n: number) => '0x' + n.toString(16)
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-pane border transition-[transform,background-color,border-color,box-shadow] duration-150 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none'
const variants = {
  primary: 'bg-cyan text-ink border-cyan hover:shadow-[0_0_0_3px_rgb(var(--cyan)/0.25)]',
  outline: 'border-line text-fg hover:border-cyan hover:text-cyan',
  ghost: 'border-transparent text-muted hover:text-fg hover:bg-raise',
  danger: 'border-danger/60 text-danger hover:bg-danger/10',
}
type V = keyof typeof variants
export function Button({ variant = 'outline', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: V }) {
  return <button type="button" className={cx(btn, variants[variant], className)} {...p} />
}
export function ButtonLink({ variant = 'outline', className, ...p }: LinkProps & { variant?: V }) {
  return <Link className={cx(btn, variants[variant], className)} {...p} />
}

export function Pane({ className, children, as: T = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <T className={cx('border border-line bg-panel/85 rounded-pane', className)}>{children}</T>
}
export function PaneTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{children}</h2>{aside}</div>
}

const SEV: Record<Severity, { label: string; glyph: string; cls: string }> = {
  informational: { label: 'Informational', glyph: '○', cls: 'text-muted border-line' },
  low: { label: 'Low', glyph: '▽', cls: 'text-cyan border-cyan/50' },
  medium: { label: 'Medium', glyph: '◆', cls: 'text-amber border-amber/60' },
  high: { label: 'High', glyph: '▲', cls: 'text-danger border-danger/60' },
}
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity]
  return <span className={cx('inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs rounded-pane font-medium', s.cls)}><span aria-hidden>{s.glyph}</span>{s.label}</span>
}
export const CLASS_LABEL: Record<Classification, string> = {
  evidence_backed_potential: 'Evidence-backed potential vulnerability',
  heuristic_warning: 'Heuristic warning',
  inconclusive: 'Inconclusive',
}
export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'informational']

export function Notice({ kind = 'info', title, children }: { kind?: 'info' | 'warn' | 'error'; title?: string; children?: ReactNode }) {
  const Icon = kind === 'error' ? OctagonAlert : kind === 'warn' ? AlertTriangle : Info
  const c = kind === 'error' ? 'border-danger/60 text-danger' : kind === 'warn' ? 'border-amber/60 text-amber' : 'border-line text-muted'
  return (
    <div role={kind === 'error' ? 'alert' : 'note'} className={cx('flex gap-3 border px-4 py-3 text-sm rounded-pane bg-ink/40', c)}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="text-fg">{title && <p className="font-semibold">{title}</p>}{children && <div className="text-muted">{children}</div>}</div>
    </div>
  )
}
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="px-4 py-3"><dt className="text-xs text-muted">{label}</dt><dd className="mono text-lg text-fg">{value}</dd>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="border border-dashed border-line rounded-pane px-6 py-12 text-center"><h2 className="text-lg">{title}</h2>{children && <p className="mx-auto mt-2 max-w-md text-muted">{children}</p>}{action && <div className="mt-5">{action}</div>}</div>
}
export function Mono({ children }: { children: ReactNode }) { return <code className="mono text-cyan">{children}</code> }
