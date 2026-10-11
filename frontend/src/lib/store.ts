import type { AnalysisResult } from './types'

/** Browser-local scan history (localStorage). The backend has no persistence yet; nothing is ever pre-populated. */
const IDX = 'sentinel.history.v1'
const RES = (id: string) => `sentinel.result.${id}`
const MAX_ENTRIES = 10

export interface HistoryEntry { id: string; created_at: string; sha256: string; size_bytes: number; status: string; findings: number; revision: string }

export function listHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(IDX) ?? '[]') as HistoryEntry[] } catch { return [] }
}
function writeIndex(e: HistoryEntry[]) { localStorage.setItem(IDX, JSON.stringify(e)) }

export function saveResult(r: AnalysisResult): { stored: boolean } {
  const entry: HistoryEntry = { id: r.scan_id, created_at: r.created_at, sha256: r.bytecode.sha256, size_bytes: r.bytecode.size_bytes,
    status: r.status, findings: r.findings.length, revision: r.bytecode.evm_revision }
  let list = [entry, ...listHistory().filter((x) => x.id !== entry.id)]
  for (;;) {
    try {
      localStorage.setItem(RES(r.scan_id), JSON.stringify(r))
      break
    } catch {
      if (list.length <= 1) return { stored: false }
      const drop = list[list.length - 1]
      list = list.slice(0, -1)
      localStorage.removeItem(RES(drop.id))
    }
  }
  for (const old of list.slice(MAX_ENTRIES)) localStorage.removeItem(RES(old.id))
  list = list.slice(0, MAX_ENTRIES)
  try { writeIndex(list) } catch { return { stored: false } }
  return { stored: true }
}
export function getResult(id: string): AnalysisResult | null {
  try { const s = localStorage.getItem(RES(id)); return s ? (JSON.parse(s) as AnalysisResult) : null } catch { return null }
}
export function deleteResult(id: string) {
  localStorage.removeItem(RES(id)); writeIndex(listHistory().filter((x) => x.id !== id))
}
export function clearHistory() { for (const e of listHistory()) localStorage.removeItem(RES(e.id)); localStorage.removeItem(IDX) }
