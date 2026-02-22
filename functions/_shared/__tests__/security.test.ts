import { describe, expect, it } from 'vitest'

import { constantTimeEqual, hashSessionToken, requireSessionPepper } from '../security'

async function expectedHash(token: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const tokenBase64Url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

  const payload = new TextEncoder().encode(`${tokenBase64Url}${pepper}`)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

describe('security helpers', () => {
  it('hashes session token with sha256(base64url(token)+pepper)', async () => {
    const token = 'token-123'
    const pepper = 'pepper-xyz'
    const expected = await expectedHash(token, pepper)

    await expect(hashSessionToken(token, pepper)).resolves.toBe(expected)
  })

  it('returns server_misconfigured when SESSION_PEPPER is missing or blank', () => {
    expect(requireSessionPepper({})).toEqual({
      ok: false,
      status: 500,
      code: 'server_misconfigured',
      message: 'SESSION_PEPPER is not configured.',
    })

    expect(requireSessionPepper({ SESSION_PEPPER: '   ' })).toEqual({
      ok: false,
      status: 500,
      code: 'server_misconfigured',
      message: 'SESSION_PEPPER is not configured.',
    })
  })

  it('compares hash values in constant-time style semantics', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true)
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
    expect(constantTimeEqual('short', 'longer')).toBe(false)
  })
})
