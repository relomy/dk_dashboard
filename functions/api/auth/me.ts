import { readCookie } from '../../_shared/cookies'
import { jsonError } from '../../_shared/errors'
import { hashSessionToken, requireSessionPepper } from '../../_shared/security'
import type { EnvBindings } from '../../_shared/types'

const SESSION_COOKIE = 'session_token'

interface SessionIdentityRow {
  user_id: string
  username: string
  role: 'owner' | 'friend'
  must_change_password: number
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const sessionToken = readCookie(request, SESSION_COOKIE)
  if (!sessionToken) {
    return jsonError(401, 'unauthenticated', 'Authentication required.')
  }

  const pepper = requireSessionPepper(env)
  if (!pepper.ok) {
    return jsonError(pepper.status, pepper.code, pepper.message)
  }

  const tokenHash = await hashSessionToken(sessionToken, pepper.value)
  const nowIso = new Date().toISOString()

  const row = await env.AUTH_DB
    .prepare(
      `SELECT
        u.id AS user_id,
        u.username,
        u.role,
        u.must_change_password
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
    return jsonError(401, 'unauthenticated', 'Authentication required.')
  }

  return new Response(
    JSON.stringify({
      user: {
        id: row.user_id,
        username: row.username,
        role: row.role,
        must_change_password: asBoolean(row.must_change_password),
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  )
}
