import { describe, expect, it } from 'vitest'

import { onRequestPost } from '../logout'
import type { EnvBindings } from '../../../_shared/types'

type QueryKind = 'first' | 'all' | 'run'

interface D1Call {
  kind: QueryKind
  sql: string
  args: unknown[]
}

interface MockD1 {
  prepare: D1Database['prepare']
  calls: D1Call[]
}

function createMockDb(sessionRow: Record<string, unknown> | null): MockD1 {
  const calls: D1Call[] = []

  const db: MockD1 = {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (sql.includes('FROM sessions')) {
              return sessionRow
            }
            return null
          },
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            return { results: [] as Record<string, unknown>[] }
          },
          run: async () => {
            calls.push({ kind: 'run', sql, args })
            return {}
          },
        }),
      } as ReturnType<D1Database['prepare']>
    },
  }

  return db
}

type TestEnv = Omit<EnvBindings, 'AUTH_DB' | 'dk_dashboard_data'> & {
  AUTH_DB: MockD1
  dk_dashboard_data: { get: (key: string) => Promise<null> }
}

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    AUTH_DB: createMockDb(null),
    SESSION_PEPPER: 'pepper_secret',
    ALLOWED_ORIGINS: 'https://preview.dashboard.pages.dev',
    dk_dashboard_data: {
      get: async () => null,
    },
    ...overrides,
  }
}

function logoutRequest(
  options: {
    origin?: string
    csrfCookie?: string
    csrfHeader?: string
    sessionCookie?: string
  } = {},
): Request {
  const headers: HeadersInit = {}

  if (options.origin) {
    headers.Origin = options.origin
  }
  if (options.csrfHeader) {
    headers['X-CSRF-Token'] = options.csrfHeader
  }

  const cookieParts: string[] = []
  if (options.csrfCookie) {
    cookieParts.push(`csrf_token=${options.csrfCookie}`)
  }
  if (options.sessionCookie) {
    cookieParts.push(`session_token=${options.sessionCookie}`)
  }
  if (cookieParts.length > 0) {
    headers.Cookie = cookieParts.join('; ')
  }

  return new Request('https://dashboard.example/api/auth/logout', {
    method: 'POST',
    headers,
  })
}

describe('/api/auth/logout', () => {
  it('requires csrf and origin checks', async () => {
    const response = await onRequestPost({
      request: logoutRequest(),
      env: buildEnv(),
    } as Parameters<typeof onRequestPost>[0])

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'csrf_failed',
        message: 'Invalid request origin.',
      },
    })
  })

  it('revokes current session and clears session/csrf cookies', async () => {
    const db = createMockDb({
      session_id: 's1',
      user_id: 'u1',
      username: 'friend',
      role: 'friend',
      must_change_password: 0,
      password_hash: 'pbkdf2_sha256$1$salt$hash',
    })

    const response = await onRequestPost({
      request: logoutRequest({
        origin: 'https://dashboard.example',
        csrfCookie: 'abc',
        csrfHeader: 'abc',
        sessionCookie: 'token_1',
      }),
      env: buildEnv({ AUTH_DB: db }),
    } as Parameters<typeof onRequestPost>[0])

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('session_token=')
    expect(setCookie).toContain('Max-Age=0')
    expect(setCookie).toContain('csrf_token=')

    expect(db.calls.some((call) => call.sql.includes('UPDATE sessions SET revoked_at'))).toBe(true)
  })
})
