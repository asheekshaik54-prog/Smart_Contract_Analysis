import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useSettings } from '../app/settings'
import { hasWebGL } from '../lib/webgl'
import { motionTokens } from '../lib/motion'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { ButtonLink } from '../components/ui'

const HeroScene = lazy(() => import('../components/three/HeroScene'))

function HeroFallback() {
  return (
    <svg className="absolute right-[-8%] top-1/2 h-[120%] max-h-[820px] -translate-y-1/2 opacity-70" viewBox="-200 -200 400 400" aria-hidden>
      <g fill="none" stroke="rgb(var(--cyan))" strokeWidth="1">
        <circle r="80" opacity=".5" className="spin-slow" strokeDasharray="2 6" /><circle r="120" opacity=".35" stroke="rgb(var(--violet))" />
        <circle r="165" opacity=".25" strokeDasharray="1 10" className="spin-slow" />
        <path d="M0-50l43 25v50L0 50-43 25v-50z" strokeWidth="2" /><path d="M0-50v100M-43-25l86 50M43-25l-86 50" opacity=".4" />
      </g>
      <circle r="14" fill="rgb(var(--violet))" />
    </svg>
  )
}

const STEPS = [
  ['Validate and normalize', 'Hex input is checked for empty, odd-length, non-hex and oversized data. Only the 0x prefix and letter case are normalized; nothing else is changed.'],
  ['Decode instructions', 'Every opcode gets an offset and size. PUSH immediates stay data and are never read as instructions. Unknown, unavailable-in-revision and truncated bytes are reported.'],
  ['Rebuild control flow', 'Bytes are split into basic blocks. A jump target is resolved only when it is a constant visible inside the block; every other jump stays marked unresolved and no edge is invented.'],
  ['Match the pattern', 'Rule REENT-001 looks for a storage write that can follow an external CALL. A call on its own is never a finding.'],
  ['Explore symbolically', 'Z3 explores paths under explicit step, depth, path and time limits, over a documented subset of EVM semantics. An opcode outside the subset stops the path; it is never approximated.'],
  ['Assemble evidence', 'A finding lists its instruction offsets, evidence items, path conditions, assumptions and known false-positive scenarios. Severity, evidence strength and exploitability stay separate.'],
  ['Fingerprint and report', 'A SHA-256 fingerprint covers bytecode, EVM revision, analyzer and rule-set versions and configuration. The full result exports as JSON.'],
] as const

function StageDiagram({ active }: { active: number }) {
  const on = (n: number) => ({ opacity: active >= n ? 1 : 0.1, transition: 'opacity 260ms var(--ease)' })
  const stroke = 'rgb(var(--cyan))'
  return (
    <svg viewBox="0 0 360 300" role="img" aria-label={`Architecture overview, stage ${active} of 7: ${STEPS[active - 1][0]}`} className="w-full">
      <g style={on(1)}>{Array.from({ length: 16 }, (_, i) => <rect key={i} x={10 + i * 21} y={12} width={17} height={20} fill="none" stroke="rgb(var(--muted))" />)}</g>
      <g style={on(2)}>{[0, 1, 3, 4, 6, 7, 9, 10, 12, 13].map((i, k) => <rect key={k} x={10 + i * 21} y={48} width={k % 3 === 0 ? 38 : 17} height={20} fill="rgb(var(--violet) / .35)" stroke="rgb(var(--violet))" />)}</g>
      <g style={on(3)} fill="none" stroke={stroke}>
        <rect x="20" y="100" width="70" height="30" /><rect x="145" y="90" width="70" height="30" /><rect x="145" y="150" width="70" height="30" />
        <rect x="270" y="120" width="70" height="30" /><rect x="145" y="210" width="70" height="30" />
        <path d="M90 115h55M90 120l55 45M215 105l55 30M215 165l55-30M180 180v30" opacity=".7" />
      </g>
      <g style={on(4)} fill="rgb(var(--amber) / .2)" stroke="rgb(var(--amber))"><rect x="145" y="90" width="70" height="30" /><rect x="145" y="210" width="70" height="30" />
        <text x="180" y="109" textAnchor="middle" fontSize="11" fill="rgb(var(--amber))" stroke="none">CALL</text><text x="180" y="229" textAnchor="middle" fontSize="11" fill="rgb(var(--amber))" stroke="none">SSTORE</text></g>
      <g style={on(5)} fill="none" stroke="rgb(var(--amber))" strokeDasharray="5 4"><path d="M55 100V80h125V90M180 120v30M180 180v30" />
        <text x="260" y="200" fontSize="12" fill="rgb(var(--violet))" stroke="none" fontWeight="600">Z3</text></g>
      <g style={on(6)}><rect x="236" y="214" width="110" height="34" fill="none" stroke="rgb(var(--amber))" /><text x="291" y="235" textAnchor="middle" fontSize="11" fill="rgb(var(--text))">finding + offsets</text></g>
      <g style={on(7)}><rect x="20" y="256" width="90" height="34" fill="none" stroke={stroke} /><text x="65" y="277" textAnchor="middle" fontSize="11" fill="rgb(var(--text))">JSON + SHA-256</text></g>
    </svg>
  )
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }
const item = (d: number): Variants => ({ hidden: { opacity: 0, y: d }, show: { opacity: 1, y: 0, transition: { duration: motionTokens.scene * 0.6, ease: motionTokens.ease } } })

export default function Landing() {
  const { settings, reducedMotion } = useSettings()
  const [failed, setFailed] = useState(false)
  const lowPower = (navigator.hardwareConcurrency ?? 8) <= 2
  const show3d = settings.threeD !== 'off' && !failed && !lowPower && hasWebGL()
  const [active, setActive] = useState(1)
  const refs = useRef<(HTMLLIElement | null)[]>([])
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step)) }), { rootMargin: '-40% 0px -50% 0px' })
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])
  const c = reducedMotion ? { initial: false as const } : { initial: 'hidden', animate: 'show' }
  return (
    <>
      <section className="relative isolate flex min-h-[calc(100svh-3.5rem)] items-center overflow-hidden">
        {show3d ? (
          <ErrorBoundary fallback={<HeroFallback />} onError={() => setFailed(true)}>
            <Suspense fallback={null}><HeroScene reduced={reducedMotion} onFail={() => setFailed(true)} /></Suspense>
          </ErrorBoundary>
        ) : <HeroFallback />}
        <div className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-r from-ink via-ink/70 to-transparent" aria-hidden />
        <motion.div className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" variants={container} {...c}>
          <div className="max-w-xl">
            <motion.h1 variants={item(18)} className="text-4xl sm:text-5xl lg:text-6xl">See what your bytecode <span className="text-cyan">actually does.</span></motion.h1>
            <motion.p variants={item(14)} className="mt-6 text-lg text-muted">SkillNova Sentinel decodes EVM runtime bytecode, rebuilds its control flow and checks it for reentrancy patterns with a bounded Z3 symbolic executor. Every finding points back to the instructions that produced it.</motion.p>
            <motion.p variants={item(14)} className="mt-4 border-l-2 border-amber pl-4 text-sm text-muted">Results are limited to the engine's supported scope: one rule (a state write after an external CALL) and a documented subset of EVM semantics. No findings is not a security guarantee.</motion.p>
            <motion.div variants={item(10)} className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/scan" variant="primary" className="px-6 py-3">Analyze Smart Contract <ArrowRight size={18} /></ButtonLink>
              <a href="#engine" className="inline-flex items-center justify-center gap-2 rounded-pane border border-line px-6 py-3 text-sm font-medium transition-colors duration-150 hover:border-cyan hover:text-cyan">Explore Analysis Engine</a>
            </motion.div>
          </div>
        </motion.div>
        <p className="absolute bottom-3 right-4 text-xs text-muted">{show3d ? 'Decorative visual. Not a live scan.' : ''}</p>
      </section>

      <section id="engine" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-3xl">How an analysis flows</h2>
            <p className="mt-3 text-muted">An architectural overview of the pipeline. The diagram does not show any particular contract.</p>
            <div className="mt-6 border border-line bg-panel/60 p-3 rounded-pane"><StageDiagram active={active} /></div>
          </div>
          <ol className="space-y-10 lg:pt-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} data-step={i + 1} ref={(el) => { refs.current[i] = el }} className="grid grid-cols-[2.5rem_1fr] gap-x-3 lg:min-h-[9rem]" style={{ opacity: active === i + 1 ? 1 : 0.55, transition: 'opacity 260ms var(--ease)' }}>
                <span className="mono pt-1 text-cyan">{String(i + 1).padStart(2, '0')}</span><div><h3 className="text-xl">{t}</h3><p className="mt-2 text-muted">{d}</p></div>
              </li>))}
          </ol>
        </div>
      </section>

      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl">What it does today</h2>
            <dl className="mt-6 divide-y divide-line">
              {[['Decoder', 'PUSH-correct, Homestead to Cancun, cross-checked against a reference disassembler.'], ['Control-flow graph', 'Blocks and edges, with unresolved jumps listed instead of guessed.'], ['REENT-001', 'State write after external CALL, with evidence and a documented severity rubric.'],
                ['Symbolic execution', 'Z3, explicit opcode subset, hard limits, honest incomplete status.'], ['Compare', 'Byte and instruction level differences between two bytecodes.'], ['Reproducibility', 'SHA-256 fingerprint over bytecode, versions and configuration; JSON export.']].map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]"><dt className="font-medium">{k}</dt><dd className="text-muted">{v}</dd></div>))}
            </dl>
          </div>
          <div id="scope">
            <h2 className="text-3xl">What it does not do</h2>
            <ul className="mt-6 list-disc space-y-2 pl-5 text-muted">
              <li>Check any vulnerability class other than the one reentrancy rule.</li>
              <li>Recognize reentrancy locks, so a guarded contract can still be flagged.</li>
              <li>See code behind jumps whose targets it cannot resolve, which includes much unoptimized compiler output.</li>
              <li>Model what the called contract does, so a symbolic path is never a demonstrated exploit.</li>
              <li>Fetch deployed contracts or resolve proxies. Paste runtime bytecode instead.</li>
            </ul>
            <p className="mt-6"><Link to="/methodology#limitations" className="text-cyan underline-offset-4 hover:underline">Read the full limitations</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
