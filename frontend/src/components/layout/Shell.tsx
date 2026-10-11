import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useSettings } from '../../app/settings'
import { motionTokens } from '../../lib/motion'
import { cx } from '../ui'

const NAV = [
  { to: '/scan', label: 'Analyze' }, { to: '/compare', label: 'Compare' }, { to: '/history', label: 'History' },
  { to: '/methodology', label: 'Methodology' }, { to: '/settings', label: 'Settings' },
]

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <path d="M16 2l12 7v14l-12 7-12-7V9z" fill="none" stroke="rgb(var(--cyan))" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="4" fill="rgb(var(--violet))" />
    </svg>
  )
}

export function Shell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { reducedMotion } = useSettings()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [pathname])
  const t = reducedMotion ? 0 : motionTokens.page
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-cyan focus:px-3 focus:py-2 focus:text-ink">Skip to content</a>
      <nav aria-label="Primary" className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight"><Logo />SkillNova <span className="text-cyan">Sentinel</span></Link>
          <ul className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <li key={n.to}><NavLink to={n.to} className={({ isActive }) => cx('px-3 py-2 text-sm rounded-pane transition-colors duration-150', isActive ? 'text-cyan' : 'text-muted hover:text-fg')}>{n.label}</NavLink></li>
            ))}
          </ul>
          <button className="p-2 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {open && (
          <ul id="mobile-nav" className="border-t border-line bg-ink px-4 py-2 md:hidden">
            {NAV.map((n) => <li key={n.to}><NavLink to={n.to} className="block py-3 text-fg">{n.label}</NavLink></li>)}
          </ul>
        )}
      </nav>
      <main id="main" className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: t, ease: motionTokens.ease }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="border-t border-line px-4 py-8 text-sm text-muted sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-md">SkillNova Sentinel analyzes the EVM bytecode you supply, within the rules and EVM subset it implements. A scan with no findings is not a security guarantee.</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li><Link className="hover:text-cyan" to="/scan">Analyze</Link></li>
            <li><Link className="hover:text-cyan" to="/methodology">Methodology</Link></li>
            <li><Link className="hover:text-cyan" to="/methodology#limitations">Limitations</Link></li>
            <li><Link className="hover:text-cyan" to="/history">History</Link></li>
            <li><Link className="hover:text-cyan" to="/settings">Settings</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
