import { describe, expect, it } from 'vitest'
import { authorizeRequest } from '../auth'

describe('authorizeRequest', () => {
  it('returns misconfigured when DASHBOARD_API_KEY is missing', () => {
    const result = authorizeRequest(new Headers(), {})
    expect(result).toEqual({
      ok: false,
      status: 500,
      code: 'server_misconfigured',
      message: 'DASHBOARD_API_KEY is not configured.',
    })
  })

  it('allows exact X-Api-Key matches', () => {
    const result = authorizeRequest(new Headers({ 'X-Api-Key': 'secret' }), { DASHBOARD_API_KEY: 'secret' })
    expect(result).toEqual({ ok: true })
  })

  it('rejects mismatch and missing headers when key is configured', () => {
    const mismatch = authorizeRequest(new Headers({ 'X-Api-Key': 'wrong' }), { DASHBOARD_API_KEY: 'secret' })
    const missing = authorizeRequest(new Headers(), { DASHBOARD_API_KEY: 'secret' })

    expect(mismatch).toEqual({
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'Invalid or missing API key.',
    })
    expect(missing).toEqual({
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'Invalid or missing API key.',
    })
  })
})
