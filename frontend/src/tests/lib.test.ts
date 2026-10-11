import { beforeEach, describe, expect, it } from 'vitest'
import { checkBytecode, sha256Hex } from '../lib/validation'
import { blockLevels, blocksForFinding, layout2D, layout3D } from '../lib/graph'
import { resolveReducedMotion } from '../lib/motion'
import { clearHistory, deleteResult, getResult, listHistory, saveResult } from '../lib/store'
import real from './real-result.json'
import type { AnalysisResult, CfgBlock, CfgEdge } from '../lib/types'

const result = real as unknown as AnalysisResult

describe('checkBytecode mirrors the backend validator', () => {
  it.each([['', 'empty'], ['0x', 'empty'], ['   ', 'empty'], ['abc', 'odd length'], ['0xzz', 'Invalid hexadecimal'], ['60  01', 'Invalid hexadecimal']])('rejects %j', (raw, msg) => {
    const r = checkBytecode(raw); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toContain(msg)
  })
  it('normalizes prefix, whitespace and case only', () => { expect(checkBytecode('  0X60AB ')).toEqual({ ok: true, hex: '60ab', bytes: 2 }) })
  it('enforces the size limit', () => { expect(checkBytecode('00'.repeat(11), 10).ok).toBe(false) })
  it('hashes like SHA-256', async () => { expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') })
})

describe('graph helpers', () => {
  const blocks: CfgBlock[] = [0, 5, 9, 20].map((s) => ({ start: s, end: s + 3, unresolved_jump: false, invalid_jump_target: null }))
  const edges: CfgEdge[] = [{ src: 0, dst: 5, kind: 'jumpi_true' }, { src: 0, dst: 9, kind: 'jumpi_false' }]
  it('assigns BFS levels and puts unreachable blocks last', () => {
    const l = blockLevels(blocks, edges, 0)
    expect([l.get(0), l.get(5), l.get(9), l.get(20)]).toEqual([0, 1, 1, 2])
  })
  it('lays out every block deterministically', () => {
    expect(layout2D(blocks, edges).size).toBe(4)
    expect(layout3D(blocks, edges)).toEqual(layout3D(blocks, edges))
  })
  it('maps a real finding onto real blocks only', () => {
    const f = result.findings[0], hi = blocksForFinding(result, f), starts = new Set(result.cfg.blocks.map((b) => b.start))
    expect(hi.size).toBeGreaterThan(0)
    for (const b of hi) expect(starts.has(b)).toBe(true)
    for (const o of f.offsets) expect([...hi].some((s) => { const b = result.cfg.blocks.find((x) => x.start === s)!; return o >= b.start && o <= b.end })).toBe(true)
  })
})

describe('API contract (real backend output)', () => {
  it('has every field the UI reads', () => {
    expect(result.findings[0]).toMatchObject({ rule_id: 'REENT-001', exploitability: 'not_assessed', solver_status: 'satisfiable_modeled_path' })
    for (const k of ['coverage', 'cfg', 'instructions', 'evidence', 'fingerprint', 'limitations', 'symbolic_execution', 'rules'] as const) expect(result[k]).toBeTruthy()
    expect(result.coverage.decoding.instructions).toBe(result.instructions.length)
    expect(result.cfg.blocks.length).toBe(result.coverage.structure.basic_blocks)
  })
})

describe('motion preference', () => {
  it.each([['reduced', false, true], ['full', true, false], ['system', true, true], ['system', false, false]] as const)('%s / system=%s -> %s', (s, sys, out) => { expect(resolveReducedMotion(s, sys)).toBe(out) })
})

describe('local history never starts populated', () => {
  beforeEach(() => localStorage.clear())
  it('is empty by default', () => { expect(listHistory()).toEqual([]) })
  it('saves, reads, deletes and clears real results', () => {
    expect(saveResult(result).stored).toBe(true)
    expect(listHistory()).toHaveLength(1); expect(getResult(result.scan_id)?.scan_id).toBe(result.scan_id)
    deleteResult(result.scan_id); expect(listHistory()).toEqual([]); expect(getResult(result.scan_id)).toBeNull()
    saveResult(result); clearHistory(); expect(listHistory()).toEqual([])
  })
  it('keeps at most 10 scans', () => {
    for (let i = 0; i < 12; i++) saveResult({ ...result, scan_id: `id-${i}` })
    expect(listHistory()).toHaveLength(10); expect(getResult('id-0')).toBeNull(); expect(getResult('id-11')).not.toBeNull()
  })
})
