import type { ConfigResult, EnvBindings } from './types'

const TEXT_ENCODER = new TextEncoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashSessionToken(token: string, pepper: string): Promise<string> {
  const tokenBase64Url = bytesToBase64Url(TEXT_ENCODER.encode(token))
  const payload = TEXT_ENCODER.encode(`${tokenBase64Url}${pepper}`)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return bytesToHex(new Uint8Array(digest))
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = TEXT_ENCODER.encode(a)
  const right = TEXT_ENCODER.encode(b)
  const maxLength = Math.max(left.length, right.length)
  let diff = left.length ^ right.length

  for (let i = 0; i < maxLength; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }

  return diff === 0
}

export function requireSessionPepper(env: Partial<Pick<EnvBindings, 'SESSION_PEPPER'>>): ConfigResult {
  const value = env.SESSION_PEPPER?.trim()
  if (!value) {
    return {
      ok: false,
      status: 500,
      code: 'server_misconfigured',
      message: 'SESSION_PEPPER is not configured.',
    }
  }

  return {
    ok: true,
    value,
  }
}
