import { describe, expect, it } from 'vitest'

import { onRequestPost } from '../change-password'
import { hashPassword } from '../../../_shared/password'
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

interface SessionUserRow {
  session_id: string
  user_id: string
  username: string
  role: 'owner' | 'friend'
  must_change_password: number
  password_hash: string
}

function createMockDb(row: SessionUserRow | null): MockD1 {
  const calls: D1Call[] = []

  const db: MockD1 = {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (sql.includes('FROM sessions')) {
              return row
            }
            return null
          },
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            if (sql.includes('FROM sessions')) {
              return { results: [] as Record<string, unknown>[] }
            }
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

function changePasswordRequest(
  body: Record<string, unknown>,
  options: {
    origin?: string
    csrfCookie?: string
    csrfHeader?: string
    sessionCookie?: string
  } = {},
): Request {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  }

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

  return new Request('https://dashboard.example/api/auth/change-password', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('/api/auth/change-password', () => {
  it('requires csrf and origin checks', async () => {
    const response = await onRequestPost({
      request: changePasswordRequest({ current_password: 'old', new_password: '123456789012' }),
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

  it('requires current password when must_change_password is false', async () => {
    const passwordHash = await hashPassword('old_password_123')
    const response = await onRequestPost({
      request: changePasswordRequest(
        {
          new_password: 'new_password_123',
        },
        {
          origin: 'https://dashboard.example',
          csrfCookie: 'abc',
          csrfHeader: 'abc',
          sessionCookie: 'token_1',
        },
      ),
      env: buildEnv({
        AUTH_DB: createMockDb({
          session_id: 's1',
          user_id: 'u1',
          username: 'friend',
          role: 'friend',
          must_change_password: 0,
          password_hash: passwordHash,
        }),
      }),
    } as Parameters<typeof onRequestPost>[0])

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'Current password is required.',
      },
    })
  })

  it('enforces minimum new password length', async () => {
    const passwordHash = await hashPassword('old_password_123')
    const response = await onRequestPost({
      request: changePasswordRequest(
        {
          current_password: 'old_password_123',
          new_password: 'short',
        },
        {
          origin: 'https://dashboard.example',
          csrfCookie: 'abc',
          csrfHeader: 'abc',
          sessionCookie: 'token_1',
        },
      ),
      env: buildEnv({
        AUTH_DB: createMockDb({
          session_id: 's1',
          user_id: 'u1',
          username: 'friend',
          role: 'friend',
          must_change_password: 0,
          password_hash: passwordHash,
        }),
      }),
    } as Parameters<typeof onRequestPost>[0])

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'New password must be at least 12 characters.',
      },
    })
  })

  it('changes password, clears must_change_password, revokes sessions, and rotates active session', async () => {
    const passwordHash = await hashPassword('old_password_123')
    const db = createMockDb({
      session_id: 's1',
      user_id: 'u1',
      username: 'friend',
      role: 'friend',
      must_change_password: 1,
      password_hash: passwordHash,
    })

    const response = await onRequestPost({
      request: changePasswordRequest(
        {
          new_password: 'new_password_123',
        },
        {
          origin: 'https://dashboard.example',
          csrfCookie: 'abc',
          csrfHeader: 'abc',
          sessionCookie: 'token_1',
        },
      ),
      env: buildEnv({
        AUTH_DB: db,
      }),
    } as Parameters<typeof onRequestPost>[0])

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('session_token=')
    expect(setCookie).toContain('csrf_token=')

    expect(db.calls.some((call) => call.sql.includes('UPDATE users SET password_hash'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('UPDATE sessions SET revoked_at'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO sessions'))).toBe(true)
  })
})
