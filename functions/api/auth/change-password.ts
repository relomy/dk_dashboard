import { writeAuditEvent } from '../../_shared/audit'
import { insertSession, revokeAllSessionsForUser } from '../../_shared/authRepo'
import { buildCookie } from '../../_shared/cookies'
import { validateCsrfDoubleSubmit } from '../../_shared/csrf'
import { jsonError } from '../../_shared/errors'
import { validateStateChangingOrigin } from '../../_shared/origin'
import { hashPassword, verifyPassword } from '../../_shared/password'
import { hashSessionToken, requireSessionPepper } from '../../_shared/security'
import { requireAuthenticatedSession } from '../../_shared/sessionAuth'
import type { EnvBindings } from '../../_shared/types'

const SESSION_COOKIE = 'session_token'
const CSRF_COOKIE = 'csrf_token'
const SESSION_TTL_SECONDS = 8 * 60 * 60
const MIN_PASSWORD_LENGTH = 12

interface ChangePasswordBody {
  current_password?: string
  new_password?: string
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

export const onRequestPost: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const originCheck = validateStateChangingOrigin(request, env)
  if (!originCheck.ok) {
    return jsonError(originCheck.status, originCheck.code, originCheck.message)
  }

  let body: ChangePasswordBody
  try {
    body = (await request.json()) as ChangePasswordBody
  } catch {
    return jsonError(400, 'invalid_request', 'Invalid JSON body.')
  }

  const csrfCheck = validateCsrfDoubleSubmit(request, { bodyToken: body.csrf_token })
  if (!csrfCheck.ok) {
    return jsonError(csrfCheck.status, csrfCheck.code, csrfCheck.message)
  }

  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return auth.response
  }

  const newPassword = typeof body.new_password === 'string' ? body.new_password : ''
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return jsonError(400, 'invalid_request', 'New password must be at least 12 characters.')
  }

  if (!auth.session.mustChangePassword) {
    const currentPassword = typeof body.current_password === 'string' ? body.current_password : ''
    if (!currentPassword) {
      return jsonError(400, 'invalid_request', 'Current password is required.')
    }

    const validCurrentPassword = await verifyPassword(currentPassword, auth.session.passwordHash)
    if (!validCurrentPassword) {
      return jsonError(401, 'unauthenticated', 'Current password is incorrect.')
    }
  }

  const pepper = requireSessionPepper(env)
  if (!pepper.ok) {
    return jsonError(pepper.status, pepper.code, pepper.message)
  }

  const nowIso = new Date().toISOString()
  const newPasswordHash = await hashPassword(newPassword)
  await env.AUTH_DB
    .prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 0, temp_password_expires_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .bind(newPasswordHash, nowIso, auth.session.userId)
    .run()

  await revokeAllSessionsForUser(env.AUTH_DB, auth.session.userId, nowIso)

  const sessionToken = randomToken(32)
  const sessionTokenHash = await hashSessionToken(sessionToken, pepper.value)
  const sessionId = `sess_${randomToken(16)}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

  await insertSession(env.AUTH_DB, {
    id: sessionId,
    userId: auth.session.userId,
    tokenHash: sessionTokenHash,
    expiresAt,
    createdAt: nowIso,
    rotatedFromSessionId: auth.session.sessionId,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
  })

  await writeAuditEvent(env.AUTH_DB, {
    id: `audit_${randomToken(16)}`,
    actorUserId: auth.session.userId,
    action: 'password_change',
    targetUserId: auth.session.userId,
    metadataJson: null,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
    createdAt: nowIso,
  })

  const secure = new URL(request.url).protocol === 'https:'
  const csrfToken = randomToken(24)
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

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  })
}
