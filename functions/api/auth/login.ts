import { buildCookie } from '../../_shared/cookies'
import { validateCsrfDoubleSubmit } from '../../_shared/csrf'
import { jsonError } from '../../_shared/errors'
import { validateStateChangingOrigin } from '../../_shared/origin'
import { verifyPassword } from '../../_shared/password'
import { requireSessionPepper, hashSessionToken } from '../../_shared/security'
import type { EnvBindings } from '../../_shared/types'
import { findUserByUsername, insertSession, pruneSessionsToLimit } from '../../_shared/authRepo'
import { writeAuditEvent } from '../../_shared/audit'

const SESSION_COOKIE = 'session_token'
const CSRF_COOKIE = 'csrf_token'
const SESSION_TTL_SECONDS = 8 * 60 * 60

interface LoginBody {
  username: string
  password: string
  csrf_token?: string
}

function randomToken(bytes = 32): string {
  const tokenBytes = new Uint8Array(bytes)
  crypto.getRandomValues(tokenBytes)

  let binary = ''
  for (const byte of tokenBytes) {
    binary += String.fromCharCode(byte)
  }

  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function nowIso(): string {
  return new Date().toISOString()
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function tempPasswordExpired(user: { must_change_password: unknown; temp_password_expires_at: unknown }, atIso: string): boolean {
  if (!asBoolean(user.must_change_password)) {
    return false
  }

  const expiresAt = typeof user.temp_password_expires_at === 'string' ? user.temp_password_expires_at : null
  if (!expiresAt) {
    return false
  }

  return expiresAt <= atIso
}

function unauthorized(): Response {
  return jsonError(401, 'unauthenticated', 'Invalid username or password.')
}

export const onRequestPost: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const originCheck = validateStateChangingOrigin(request, env)
  if (!originCheck.ok) {
    return jsonError(originCheck.status, originCheck.code, originCheck.message)
  }

  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    return jsonError(400, 'invalid_request', 'Invalid JSON body.')
  }

  const csrfCheck = validateCsrfDoubleSubmit(request, { bodyToken: body.csrf_token })
  if (!csrfCheck.ok) {
    return jsonError(csrfCheck.status, csrfCheck.code, csrfCheck.message)
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) {
    return unauthorized()
  }

  const user = await findUserByUsername(env.AUTH_DB, username)
  if (!user) {
    return unauthorized()
  }

  const active = asBoolean(user.is_active)
  if (!active) {
    return unauthorized()
  }

  if (tempPasswordExpired(user, nowIso())) {
    return unauthorized()
  }

  const validPassword = await verifyPassword(password, user.password_hash)
  if (!validPassword) {
    return unauthorized()
  }

  const pepper = requireSessionPepper(env)
  if (!pepper.ok) {
    return jsonError(pepper.status, pepper.code, pepper.message)
  }

  const issuedAt = nowIso()
  const sessionToken = randomToken(32)
  const sessionTokenHash = await hashSessionToken(sessionToken, pepper.value)
  const sessionId = `sess_${randomToken(16)}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  const csrfToken = randomToken(24)
  const secure = new URL(request.url).protocol === 'https:'

  await insertSession(env.AUTH_DB, {
    id: sessionId,
    userId: user.id,
    tokenHash: sessionTokenHash,
    expiresAt,
    createdAt: issuedAt,
    rotatedFromSessionId: null,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
  })
  await pruneSessionsToLimit(env.AUTH_DB, user.id, 3, issuedAt)

  await env.AUTH_DB
    .prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(issuedAt, issuedAt, user.id)
    .run()

  await writeAuditEvent(env.AUTH_DB, {
    id: `audit_${randomToken(16)}`,
    actorUserId: user.id,
    action: 'login_success',
    targetUserId: user.id,
    metadataJson: null,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
    createdAt: issuedAt,
  })

  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  headers.append(
    'set-cookie',
    buildCookie(SESSION_COOKIE, sessionToken, {
      maxAgeSeconds: SESSION_TTL_SECONDS,
      sameSite: 'Lax',
      secure,
      httpOnly: true,
    }),
  )
  headers.append(
    'set-cookie',
    buildCookie(CSRF_COOKIE, csrfToken, {
      maxAgeSeconds: SESSION_TTL_SECONDS,
      sameSite: 'Lax',
      secure,
      httpOnly: false,
    }),
  )

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        must_change_password: asBoolean(user.must_change_password),
      },
    }),
    {
      status: 200,
      headers,
    },
  )
}
