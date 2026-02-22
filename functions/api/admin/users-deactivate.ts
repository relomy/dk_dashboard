import { writeAuditEvent } from '../../_shared/audit'
import { revokeAllSessionsForUser } from '../../_shared/authRepo'
import { jsonError } from '../../_shared/errors'
import type { EnvBindings } from '../../_shared/types'
import { generateId, requireOwner } from './_helpers'

interface DeactivateBody {
  user_id?: string
  csrf_token?: string
}

export const onRequestPost: PagesFunction<EnvBindings> = async ({ request, env }) => {
  let body: DeactivateBody
  try {
    body = (await request.json()) as DeactivateBody
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

  if (userId === owner.session.userId) {
    return jsonError(400, 'owner_safety_violation', 'Owners cannot deactivate themselves.')
  }

  const target = await env.AUTH_DB
    .prepare('SELECT id, role, is_active FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; role: 'owner' | 'friend'; is_active: number }>()

  if (!target) {
    return jsonError(404, 'not_found', 'User not found.')
  }

  const activeTarget = target.is_active === 1
  if (target.role === 'owner' && activeTarget) {
    const countRows = await env.AUTH_DB
      .prepare("SELECT COUNT(*) AS active_owner_count FROM users WHERE role = 'owner' AND is_active = 1")
      .bind()
      .all<{ active_owner_count: number | string }>()
    const activeOwnerCount = Number(countRows.results[0]?.active_owner_count ?? 0)
    if (activeOwnerCount <= 1) {
      return jsonError(400, 'owner_safety_violation', 'Cannot deactivate the last active owner.')
    }
  }

  const nowIso = new Date().toISOString()
  await env.AUTH_DB
    .prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(nowIso, userId)
    .run()
  await revokeAllSessionsForUser(env.AUTH_DB, userId, nowIso)

  await writeAuditEvent(env.AUTH_DB, {
    id: generateId('audit'),
    actorUserId: owner.session.userId,
    action: 'admin_deactivate_user',
    targetUserId: userId,
    metadataJson: null,
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
    createdAt: nowIso,
  })

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
