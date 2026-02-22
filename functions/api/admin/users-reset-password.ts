import { writeAuditEvent } from '../../_shared/audit'
import { revokeAllSessionsForUser } from '../../_shared/authRepo'
import { jsonError } from '../../_shared/errors'
import { hashPassword } from '../../_shared/password'
import type { EnvBindings } from '../../_shared/types'
import { generateId, generateTempPassword, plusHours, requireOwner } from './_helpers'

interface ResetPasswordBody {
  user_id?: string
  temporary_password?: string
  csrf_token?: string
}

export const onRequestPost: PagesFunction<EnvBindings> = async ({ request, env }) => {
  let body: ResetPasswordBody
  try {
    body = (await request.json()) as ResetPasswordBody
  } catch {
    return jsonError(400, 'invalid_request', 'Invalid JSON body.')
  }

  const owner = await requireOwner(request, env, { csrfBodyToken: body.csrf_token })
  if (!owner.ok) {
    return owner.response
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  if (!userId) {
    return jsonError(400, 'invalid_request', 'user_id is required.')
  }

  const target = await env.AUTH_DB
    .prepare('SELECT id, username FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; username: string }>()

  if (!target) {
    return jsonError(404, 'not_found', 'User not found.')
  }

  const nowIso = new Date().toISOString()
  const tempPassword = typeof body.temporary_password === 'string' && body.temporary_password.length >= 12
    ? body.temporary_password
    : generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  const tempPasswordExpiresAt = plusHours(nowIso, 24)

  await env.AUTH_DB
    .prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 1, temp_password_expires_at = ?, updated_at = ? WHERE id = ?',
    )
    .bind(passwordHash, tempPasswordExpiresAt, nowIso, userId)
    .run()
  await revokeAllSessionsForUser(env.AUTH_DB, userId, nowIso)

  await writeAuditEvent(env.AUTH_DB, {
    id: generateId('audit'),
    actorUserId: owner.session.userId,
    action: 'admin_reset_password',
    targetUserId: userId,
    metadataJson: null,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
    createdAt: nowIso,
  })

  return new Response(
    JSON.stringify({
      user_id: userId,
      temporary_password: tempPassword,
      must_change_password: true,
      temp_password_expires_at: tempPasswordExpiresAt,
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
