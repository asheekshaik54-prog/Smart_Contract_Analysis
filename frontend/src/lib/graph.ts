import type { AnalysisResult, CfgBlock, CfgEdge, Finding } from './types'

/** BFS depth from the entry block along resolved edges. Blocks unreachable that way are placed in trailing levels. */
export function blockLevels(blocks: CfgBlock[], edges: CfgEdge[], entry: number): Map<number, number> {
  const adj = new Map<number, number[]>()
  for (const e of edges) { if (!adj.has(e.src)) adj.set(e.src, []); adj.get(e.src)!.push(e.dst) }
  const level = new Map<number, number>()
  if (blocks.length === 0) return level
  const q = [entry]; level.set(entry, 0)
  for (let i = 0; i < q.length; i++) for (const n of adj.get(q[i]) ?? []) if (!level.has(n)) { level.set(n, level.get(q[i])! + 1); q.push(n) }
  let extra = Math.max(...level.values()) + 1
  for (const b of [...blocks].sort((a, b) => a.start - b.start)) if (!level.has(b.start)) level.set(b.start, extra++)
  return level
}

function rowsOf(blocks: CfgBlock[], edges: CfgEdge[]) {
  const entry = blocks.length ? Math.min(...blocks.map((b) => b.start)) : 0
  const lv = blockLevels(blocks, edges, entry)
  const rows = new Map<number, number[]>()
  for (const b of [...blocks].sort((a, b) => a.start - b.start)) {
    const l = lv.get(b.start)!
    if (!rows.has(l)) rows.set(l, [])
    rows.get(l)!.push(b.start)
  }
  return rows
}

export function layout2D(blocks: CfgBlock[], edges: CfgEdge[]): Map<number, { x: number; y: number }> {
  const pos = new Map<number, { x: number; y: number }>()
  for (const [l, row] of rowsOf(blocks, edges)) row.forEach((s, i) => pos.set(s, { x: i * 190 - ((row.length - 1) * 190) / 2, y: l * 90 }))
  return pos
}

/** Deterministic 3D layout: depth along x, blocks of the same level spread on a spiral in the y/z plane. */
export function layout3D(blocks: CfgBlock[], edges: CfgEdge[]): Map<number, [number, number, number]> {
  const rows = rowsOf(blocks, edges)
  const maxL = Math.max(0, ...rows.keys())
  const pos = new Map<number, [number, number, number]>()
  for (const [l, row] of rows) row.forEach((s, i) => {
    const a = i * 2.399963, r = row.length === 1 ? 0 : 0.5 + 0.35 * Math.sqrt(i)
    pos.set(s, [(l - maxL / 2) * 1.1, Math.sin(a) * r, Math.cos(a) * r])
  })
  return pos
}

export function blockOfOffset(blocks: CfgBlock[], offset: number): number | null {
  for (const b of blocks) if (offset >= b.start && offset <= b.end) return b.start
  return null
}

/** Blocks that hold a finding's offsets plus blocks on its CFG-path evidence. Derived only from engine output. */
export function blocksForFinding(r: AnalysisResult, f: Finding): Set<number> {
  const out = new Set<number>()
  for (const o of f.offsets) { const b = blockOfOffset(r.cfg.blocks, o); if (b !== null) out.add(b) }
  for (const e of r.evidence) if (f.evidence_ids.includes(e.id) && e.kind === 'cfg_path') {
    const bl = e.data.blocks
    if (Array.isArray(bl)) for (const b of bl) if (typeof b === 'number') out.add(b)
  }
  return out
}
