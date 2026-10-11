import type { AnalysisResult, Capabilities, CompareResult, Limits } from './types'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('aborted', 'Request cancelled.')
    throw new ApiError('unreachable', `Cannot reach the analysis API${API_BASE ? ` at ${API_BASE}` : ''}. Start the backend (uvicorn app.api.main:app) and retry.`)
  }
  if (!res.ok) {
    let code = 'http_error', message = `The API returned status ${res.status}.`
    try {
      const body = await res.json()
      if (body?.error) { code = body.error.code; message = body.error.message }
      else if (body?.detail) {
        const d = body.detail
        if (typeof d === 'string') message = d
        else if (Array.isArray(d)) message = d.map((x: { loc?: unknown[]; msg: string }) => `${(x.loc ?? []).slice(1).join('.')}: ${x.msg}`).join('; ')
        else if (d.message) { code = d.code ?? code; message = d.message }
      }
    } catch { /* non-JSON error body */ }
    throw new ApiError(code, message, res.status)
  }
  return res.json() as Promise<T>
}

export const api = {
  capabilities: () => request<Capabilities>('/api/v1/capabilities'),
  health: () => request<{ status: string; version: string }>('/health'),
  analyze: (body: { bytecode: string; evm_revision: string; run_symbolic: boolean; limits: Limits }, signal?: AbortSignal) =>
    request<AnalysisResult>('/api/v1/analyze', { method: 'POST', body: JSON.stringify(body), signal }),
  compare: (body: { original: string; updated: string; evm_revision: string }, signal?: AbortSignal) =>
    request<CompareResult>('/api/v1/compare', { method: 'POST', body: JSON.stringify(body), signal }),
}
