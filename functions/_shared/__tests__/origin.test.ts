import { describe, expect, it } from 'vitest'

import { validateStateChangingOrigin } from '../origin'

describe('validateStateChangingOrigin', () => {
  it('accepts exact same-origin requests', () => {
    const request = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://dashboard.example',
      },
    })

    expect(validateStateChangingOrigin(request, {})).toEqual({ ok: true, origin: 'https://dashboard.example' })
  })

  it('accepts referer when origin header is absent', () => {
    const request = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Referer: 'https://dashboard.example/login',
      },
    })

    expect(validateStateChangingOrigin(request, {})).toEqual({ ok: true, origin: 'https://dashboard.example' })
  })

  it('accepts configured preview/prod allowlist origins', () => {
    const request = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://preview.dashboard.pages.dev',
      },
    })

    expect(validateStateChangingOrigin(request, { ALLOWED_ORIGINS: 'https://preview.dashboard.pages.dev' })).toEqual({
      ok: true,
      origin: 'https://preview.dashboard.pages.dev',
    })
  })

  it('accepts localhost origins for local dev', () => {
    const request = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
      },
    })

    expect(validateStateChangingOrigin(request, {})).toEqual({ ok: true, origin: 'http://localhost:5173' })
  })

  it('rejects missing or invalid origins', () => {
    const missing = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
    })

    const invalid = new Request('https://dashboard.example/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example',
      },
    })

    expect(validateStateChangingOrigin(missing, {})).toEqual({
      ok: false,
      status: 403,
      code: 'csrf_failed',
      message: 'Invalid request origin.',
    })

    expect(validateStateChangingOrigin(invalid, {})).toEqual({
      ok: false,
      status: 403,
      code: 'csrf_failed',
      message: 'Invalid request origin.',
    })
  })
})
