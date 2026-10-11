import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SettingsProvider } from '../app/settings'
import Landing from '../pages/Landing'
import Scanner from '../pages/Scanner'
import History from '../pages/History'
import Results from '../pages/Results'
import { FindingsPanel } from '../components/findings/FindingsPanel'
import real from './real-result.json'
import type { AnalysisResult } from '../lib/types'

const result = real as unknown as AnalysisResult
const wrap = (ui: ReactNode, entries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/']) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SettingsProvider><MemoryRouter initialEntries={entries}>{ui}</MemoryRouter></SettingsProvider></QueryClientProvider>)

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('Landing', () => {
  it('works without WebGL: primary action routes to the scanner, engine link is an in-page anchor', () => {
    wrap(<Landing />)  // jsdom has no WebGL, so the 2D fallback renders
    expect(screen.getByRole('link', { name: /Analyze Smart Contract/ })).toHaveAttribute('href', '/scan')
    expect(screen.getByRole('link', { name: 'Explore Analysis Engine' })).toHaveAttribute('href', '#engine')
    expect(screen.getByText(/No findings is not a security guarantee/)).toBeInTheDocument()
    expect(screen.queryByText(/Decorative visual/)).not.toBeInTheDocument()
  })
  it('contains no fabricated statistics or testimonials', () => {
    const { container } = wrap(<Landing />)
    expect(container.textContent).not.toMatch(/\d+\s*(\+|k|M)?\s*(contracts|audits|customers|users)/i)
  })
})

describe('Scanner', () => {
  it('rejects invalid hex client-side and never calls the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    wrap(<Scanner />)
    const start = screen.getByRole('button', { name: 'Start analysis' })
    expect(start).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Runtime bytecode (hex)'), '0xzz')
    expect(await screen.findByText(/Invalid hexadecimal character/)).toBeInTheDocument()
    expect(start).toBeDisabled()
    expect(fetchSpy.mock.calls.every(([u]) => !String(u).includes('/analyze'))).toBe(true)
  })
  it('loading a fixture only fills the box; it does not start a scan', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    wrap(<Scanner />)
    await userEvent.click(screen.getByRole('button', { name: /Load SafeBank/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start analysis' })).toBeEnabled())
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/analyze'))).toBe(false)
  })
  it('shows a truthful failure when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    wrap(<Scanner />)
    await userEvent.click(screen.getByRole('button', { name: /Load SafeBank/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start analysis' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Start analysis' }))
    expect(await screen.findByText(/Cannot reach the analysis API/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Analysis failed', { selector: 'p[role=status]' })).toBeInTheDocument()
  })
})

describe('History', () => {
  it('shows an empty state, not sample data', () => {
    wrap(<History />)
    expect(screen.getByText('No scans yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('Findings and results', () => {
  it('renders the real finding without claiming exploitability', () => {
    wrap(<FindingsPanel result={result} focusedId={result.findings[0].id} onFocus={() => {}} onJump={() => {}} />)
    expect(screen.getByText('Not assessed by the engine')).toBeInTheDocument()
    expect(screen.getByText(/Not proof of a real exploit/)).toBeInTheDocument()
    expect(screen.getByText('Evidence-backed potential vulnerability')).toBeInTheDocument()
    expect(screen.getByText('Known false-positive scenarios')).toBeInTheDocument()
  })
  it('a result with no findings says that is not a safety claim', () => {
    wrap(<FindingsPanel result={{ ...result, findings: [] }} focusedId={null} onFocus={() => {}} onJump={() => {}} />)
    expect(screen.getByText(/does not mean the contract is secure/)).toBeInTheDocument()
  })
  it('Results page: tabs work by keyboard, limits are shown, unknown id is handled', async () => {
    wrap(<Routes><Route path="/results/:id" element={<Results />} /></Routes>, [{ pathname: `/results/${result.scan_id}`, state: { result } }])
    expect(screen.getByText('Completed with limitations')).toBeInTheDocument()
    expect(screen.getByText(/Read these limits/)).toBeInTheDocument()
    const tabs = screen.getByRole('tablist'); const first = within(tabs).getByRole('tab', { name: 'Overview' })
    first.focus(); fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(within(tabs).getByRole('tab', { name: /Findings/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Instructions' }))
    expect(await screen.findAllByRole('row')).not.toHaveLength(0)
  })
  it('unknown scan id shows an empty state', () => {
    wrap(<Routes><Route path="/results/:id" element={<Results />} /></Routes>, ['/results/nope'])
    expect(screen.getByText('Scan not found')).toBeInTheDocument()
  })
})
