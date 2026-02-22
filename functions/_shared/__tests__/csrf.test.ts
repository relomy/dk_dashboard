import { describe, expect, it } from 'vitest'

import { validateCsrfDoubleSubmit } from '../csrf'

describe('validateCsrfDoubleSubmit', () => {
  it('accepts matching csrf cookie and header token', () => {
    const request = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Cookie: 'csrf_token=abc123',
        'X-CSRF-Token': 'abc123',
      },
    })

    expect(validateCsrfDoubleSubmit(request)).toEqual({ ok: true, token: 'abc123' })
  })

  it('accepts matching csrf cookie and body token fallback', () => {
    const request = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Cookie: 'csrf_token=abc123',
      },
    })

    expect(validateCsrfDoubleSubmit(request, { bodyToken: 'abc123' })).toEqual({ ok: true, token: 'abc123' })
  })

  it('rejects missing or mismatched tokens', () => {
    const missing = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Cookie: 'csrf_token=abc123',
      },
    })
    const mismatch = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Cookie: 'csrf_token=abc123',
        'X-CSRF-Token': 'zzz',
      },
    })

    expect(validateCsrfDoubleSubmit(missing)).toEqual({
      ok: false,
      status: 403,
      code: 'csrf_failed',
      message: 'Invalid CSRF token.',
    })
    expect(validateCsrfDoubleSubmit(mismatch)).toEqual({
      ok: false,
      status: 403,
      code: 'csrf_failed',
      message: 'Invalid CSRF token.',
    })
  })
})
