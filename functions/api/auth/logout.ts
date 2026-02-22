import { writeAuditEvent } from '../../_shared/audit'
import { revokeSessionById } from '../../_shared/authRepo'
import { buildCookie } from '../../_shared/cookies'
import { validateCsrfDoubleSubmit } from '../../_shared/csrf'
import { jsonError } from '../../_shared/errors'
import { validateStateChangingOrigin } from '../../_shared/origin'
import { requireAuthenticatedSession } from '../../_shared/sessionAuth'
import type { EnvBindings } from '../../_shared/types'

const SESSION_COOKIE = 'session_token'
const CSRF_COOKIE = 'csrf_token'

function randomToken(bytes = 16): string {
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

  const csrfCheck = validateCsrfDoubleSubmit(request)
  if (!csrfCheck.ok) {
    return jsonError(csrfCheck.status, csrfCheck.code, csrfCheck.message)
  }

  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return auth.response
  }

  const nowIso = new Date().toISOString()
  await revokeSessionById(env.AUTH_DB, auth.session.sessionId, nowIso)
  await writeAuditEvent(env.AUTH_DB, {
    id: `audit_${randomToken(16)}`,
    actorUserId: auth.session.userId,
    action: 'logout',
    targetUserId: auth.session.userId,
    metadataJson: null,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
    createdAt: nowIso,
  })

  const secure = new URL(request.url).protocol === 'https:'
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  headers.append(
    'set-cookie',
    buildCookie(SESSION_COOKIE, '', {
      maxAgeSeconds: 0,
      sameSite: 'Lax',
      secure,
      httpOnly: true,
    }),
  )
  headers.append(
    'set-cookie',
    buildCookie(CSRF_COOKIE, '', {
      maxAgeSeconds: 0,
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
