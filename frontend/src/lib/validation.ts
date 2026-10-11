/** Mirrors backend/app/analysis/validator.py. The server remains authoritative. */
export const MAX_BYTES = 24_576
export type HexCheck = { ok: true; hex: string; bytes: number } | { ok: false; error: string }

export function checkBytecode(raw: string, maxBytes = MAX_BYTES): HexCheck {
  let s = raw.trim()
  if (s.slice(0, 2) === '0x' || s.slice(0, 2) === '0X') s = s.slice(2)
  if (!s) return { ok: false, error: 'Bytecode is empty.' }
  if (s.length % 2) return { ok: false, error: 'Hex string has odd length.' }
  const bad = s.search(/[^0-9a-fA-F]/)
  if (bad >= 0) return { ok: false, error: `Invalid hexadecimal character ${JSON.stringify(s[bad])} at position ${bad}.` }
  if (s.length / 2 > maxBytes) return { ok: false, error: `Bytecode exceeds the maximum of ${maxBytes} bytes.` }
  return { ok: true, hex: s.toLowerCase(), bytes: s.length / 2 }
}

export async function sha256Hex(hex: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}
