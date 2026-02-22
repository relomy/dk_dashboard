import { describe, expect, it } from 'vitest'

import { onRequestGet, onRequestPost } from '../users'
import { onRequestPost as onRequestResetPassword } from '../users-reset-password'
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

interface MockDbOptions {
  firstQueue?: Array<Record<string, unknown> | null>
  allBySql?: Array<{ includes: string; results: Array<Record<string, unknown>> }>
}

function createMockDb(options: MockDbOptions = {}): MockD1 {
  const calls: D1Call[] = []
  const firstQueue = [...(options.firstQueue ?? [])]
  const allBySql = options.allBySql ?? []

  const db: MockD1 = {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (firstQueue.length === 0) {
              return null
            }
            return firstQueue.shift() ?? null
          },
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            const matched = allBySql.find((entry) => sql.includes(entry.includes))
            return { results: matched?.results ?? [] }
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
    AUTH_DB: createMockDb(),
    SESSION_PEPPER: 'pepper_secret',
    ALLOWED_ORIGINS: 'https://preview.dashboard.pages.dev',
    dk_dashboard_data: {
      get: async () => null,
    },
    ...overrides,
  }
}

function buildHeaders(options: {
  sessionCookie?: string
  csrfCookie?: string
  csrfHeader?: string
  origin?: string
  contentType?: boolean
}): HeadersInit {
  const headers: HeadersInit = {}
  if (options.origin) {
    headers.Origin = options.origin
  }
  if (options.csrfHeader) {
    headers['X-CSRF-Token'] = options.csrfHeader
  }
  if (options.contentType) {
    headers['content-type'] = 'application/json'
  }

  const cookieParts: string[] = []
  if (options.sessionCookie) {
    cookieParts.push(`session_token=${options.sessionCookie}`)
  }
  if (options.csrfCookie) {
    cookieParts.push(`csrf_token=${options.csrfCookie}`)
  }
  if (cookieParts.length > 0) {
    headers.Cookie = cookieParts.join('; ')
  }
  return headers
}

const ownerSessionRow = {
  session_id: 's_owner',
  user_id: 'u_owner',
  username: 'owner',
  role: 'owner',
  must_change_password: 0,
  password_hash: 'pbkdf2_sha256$1$salt$hash',
}

const friendSessionRow = {
  ...ownerSessionRow,
  role: 'friend',
}

describe('/api/admin/users', () => {
  it('requires owner role for list endpoint', async () => {
    const response = await onRequestGet({
      request: new Request('https://dashboard.example/api/admin/users', {
        headers: buildHeaders({ sessionCookie: 'tok_friend' }),
      }),
      env: buildEnv({
        AUTH_DB: createMockDb({
          firstQueue: [friendSessionRow],
        }),
      }),
    } as Parameters<typeof onRequestGet>[0])

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'forbidden',
        message: 'Owner access required.',
      },
    })
  })

  it('returns users list for owner', async () => {
    const response = await onRequestGet({
      request: new Request('https://dashboard.example/api/admin/users', {
        headers: buildHeaders({ sessionCookie: 'tok_owner' }),
      }),
      env: buildEnv({
        AUTH_DB: createMockDb({
          firstQueue: [ownerSessionRow],
          allBySql: [
            {
              includes: 'FROM users',
              results: [
                {
                  id: 'u_owner',
                  username: 'owner',
                  role: 'owner',
                  is_active: 1,
                  must_change_password: 0,
                  last_login_at: '2026-02-22T01:00:00Z',
                },
              ],
            },
          ],
        }),
      }),
    } as Parameters<typeof onRequestGet>[0])

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      users: [
        {
          id: 'u_owner',
          username: 'owner',
          role: 'owner',
          is_active: true,
          must_change_password: false,
          last_login_at: '2026-02-22T01:00:00Z',
        },
      ],
    })
  })

  it('creates user with generated temporary password by default', async () => {
    const db = createMockDb({
      firstQueue: [ownerSessionRow],
    })

    const response = await onRequestPost({
      request: new Request('https://dashboard.example/api/admin/users', {
        method: 'POST',
        headers: buildHeaders({
          origin: 'https://dashboard.example',
          sessionCookie: 'tok_owner',
          csrfCookie: 'csrf_1',
          csrfHeader: 'csrf_1',
          contentType: true,
        }),
        body: JSON.stringify({
          username: 'friend_1',
          role: 'friend',
        }),
      }),
      env: buildEnv({ AUTH_DB: db }),
    } as Parameters<typeof onRequestPost>[0])

    expect(response.status).toBe(201)
    const payload = (await response.json()) as {
      user: {
        username: string
        role: string
        must_change_password: boolean
      }
      temporary_password: string
    }
    expect(payload.user.username).toBe('friend_1')
    expect(payload.user.role).toBe('friend')
    expect(payload.user.must_change_password).toBe(true)
    expect(payload.temporary_password.length).toBeGreaterThanOrEqual(12)

    expect(db.calls.some((call) => call.sql.includes('INSERT INTO users'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO auth_audit_log'))).toBe(true)
  })

  it('resets password with 24h expiry and must_change_password=true', async () => {
    const db = createMockDb({
      firstQueue: [ownerSessionRow, { id: 'u_friend', username: 'friend_1' }],
    })

    const response = await onRequestResetPassword({
      request: new Request('https://dashboard.example/api/admin/users-reset-password', {
        method: 'POST',
        headers: buildHeaders({
          origin: 'https://dashboard.example',
          sessionCookie: 'tok_owner',
          csrfCookie: 'csrf_2',
          csrfHeader: 'csrf_2',
          contentType: true,
        }),
        body: JSON.stringify({
          user_id: 'u_friend',
        }),
      }),
      env: buildEnv({ AUTH_DB: db }),
    } as Parameters<typeof onRequestResetPassword>[0])

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      user_id: string
      temporary_password: string
      must_change_password: boolean
      temp_password_expires_at: string
    }
    expect(payload.user_id).toBe('u_friend')
    expect(payload.temporary_password.length).toBeGreaterThanOrEqual(12)
    expect(payload.must_change_password).toBe(true)
    expect(payload.temp_password_expires_at).toMatch(/^20\d{2}-\d{2}-\d{2}T/)

    expect(db.calls.some((call) => call.sql.includes('UPDATE users SET password_hash'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('UPDATE sessions SET revoked_at'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO auth_audit_log'))).toBe(true)
  })
})
