import { describe, expect, it } from 'vitest'

import { onRequestGet } from '../csrf'
import type { EnvBindings } from '../../../_shared/types'

type TestEnv = Partial<EnvBindings>

describe('/api/auth/csrf', () => {
  it('returns csrf token and cookie for client bootstrap', async () => {
    const response = await onRequestGet({
      request: new Request('https://dashboard.example/api/auth/csrf'),
      env: {} as TestEnv,
    } as Parameters<typeof onRequestGet>[0])

    expect(response.status).toBe(200)
    const body = (await response.json()) as { csrf_token: string }
    expect(body.csrf_token.length).toBeGreaterThanOrEqual(16)

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('csrf_token=')
    expect(setCookie).toContain('SameSite=Lax')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
