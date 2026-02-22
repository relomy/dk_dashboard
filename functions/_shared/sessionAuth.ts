import { readCookie } from './cookies'
import { jsonError } from './errors'
import { hashSessionToken, requireSessionPepper } from './security'
import type { EnvBindings } from './types'

const SESSION_COOKIE = 'session_token'

interface SessionIdentityRow {
  session_id: string
  user_id: string
  username: string
  role: 'owner' | 'friend'
  must_change_password: number
  password_hash: string
}

export interface AuthenticatedSession {
  sessionId: string
  userId: string
  username: string
  role: 'owner' | 'friend'
  mustChangePassword: boolean
  passwordHash: string
}

export type SessionAuthResult =
  | { ok: true; session: AuthenticatedSession }
  | { ok: false; response: Response }

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export async function requireAuthenticatedSession(
  request: Request,
  env: EnvBindings,
): Promise<SessionAuthResult> {
  const sessionToken = readCookie(request, SESSION_COOKIE)
  if (!sessionToken) {
    return {
      ok: false,
      response: jsonError(401, 'unauthenticated', 'Authentication required.'),
    }
  }

  const pepper = requireSessionPepper(env)
  if (!pepper.ok) {
    return {
      ok: false,
      response: jsonError(pepper.status, pepper.code, pepper.message),
    }
  }

  const tokenHash = await hashSessionToken(sessionToken, pepper.value)
  const nowIso = new Date().toISOString()

  const row = await env.AUTH_DB
    .prepare(
      `SELECT
        s.id AS session_id,
        u.id AS user_id,
        u.username,
        u.role,
        u.must_change_password,
        u.password_hash
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
        AND u.is_active = 1
      LIMIT 1`,
    )
    .bind(tokenHash, nowIso)
    .first<SessionIdentityRow>()

  if (!row) {
    return {
      ok: false,
      response: jsonError(401, 'unauthenticated', 'Authentication required.'),
    }
  }

  return {
    ok: true,
    session: {
      sessionId: row.session_id,
      userId: row.user_id,
      username: row.username,
      role: row.role,
      mustChangePassword: asBoolean(row.must_change_password),
      passwordHash: row.password_hash,
    },
  }
}
