import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveReducedMotion, type MotionSetting } from '../lib/motion'

export interface Settings { theme: 'dark' | 'light'; motion: MotionSetting; threeD: 'auto' | 'off' }
const DEFAULTS: Settings = { theme: 'dark', motion: 'system', threeD: 'auto' }
const KEY = 'sentinel.settings.v1'

function load(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS }
}
interface Ctx { settings: Settings; set: (p: Partial<Settings>) => void; reducedMotion: boolean }
const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load)
  const [sys, setSys] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setSys(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const reducedMotion = resolveReducedMotion(settings.motion, sys)
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'
  }, [settings.theme, reducedMotion])
  const value = useMemo<Ctx>(() => ({
    settings, reducedMotion,
    set: (p) => setSettings((s) => { const n = { ...s, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* storage unavailable */ } return n }),
  }), [settings, reducedMotion])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
export function useSettings(): Ctx {
  const c = useContext(SettingsContext)
  if (!c) throw new Error('useSettings must be used inside SettingsProvider')
  return c
}
