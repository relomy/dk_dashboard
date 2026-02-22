import { describe, expect, it } from 'vitest'

import { onRequestPost as onRequestDeactivate } from '../users-deactivate'
import { onRequestPost as onRequestReactivate } from '../users-reactivate'
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

function postRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      Origin: 'https://dashboard.example',
      Cookie: 'session_token=tok_owner; csrf_token=csrf_1',
      'X-CSRF-Token': 'csrf_1',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const ownerSessionRow = {
  session_id: 's_owner',
  user_id: 'u_owner',
  username: 'owner',
  role: 'owner',
  must_change_password: 0,
  password_hash: 'pbkdf2_sha256$1$salt$hash',
}

describe('admin owner safety', () => {
  it('blocks self-deactivation', async () => {
    const response = await onRequestDeactivate({
      request: postRequest('https://dashboard.example/api/admin/users-deactivate', { user_id: 'u_owner' }),
      env: buildEnv({
        AUTH_DB: createMockDb({
          firstQueue: [ownerSessionRow],
        }),
      }),
    } as Parameters<typeof onRequestDeactivate>[0])

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'owner_safety_violation',
        message: 'Owners cannot deactivate themselves.',
      },
    })
  })

  it('blocks deactivating the last active owner', async () => {
    const response = await onRequestDeactivate({
      request: postRequest('https://dashboard.example/api/admin/users-deactivate', { user_id: 'u_other_owner' }),
      env: buildEnv({
        AUTH_DB: createMockDb({
          firstQueue: [ownerSessionRow, { id: 'u_other_owner', role: 'owner', is_active: 1 }],
          allBySql: [
            {
              includes: "role = 'owner'",
              results: [{ active_owner_count: 1 }],
            },
          ],
        }),
      }),
    } as Parameters<typeof onRequestDeactivate>[0])

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'owner_safety_violation',
        message: 'Cannot deactivate the last active owner.',
      },
    })
  })

  it('reactivates users and writes an audit event', async () => {
    const db = createMockDb({
      firstQueue: [ownerSessionRow, { id: 'u_friend', role: 'friend', is_active: 0 }],
    })

    const response = await onRequestReactivate({
      request: postRequest('https://dashboard.example/api/admin/users-reactivate', { user_id: 'u_friend' }),
      env: buildEnv({
        AUTH_DB: db,
      }),
    } as Parameters<typeof onRequestReactivate>[0])

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, user_id: 'u_friend' })
    expect(db.calls.some((call) => call.sql.includes('UPDATE users SET is_active = 1'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO auth_audit_log'))).toBe(true)
  })
})
