import { writeAuditEvent } from '../../_shared/audit'
import { jsonError } from '../../_shared/errors'
import type { EnvBindings } from '../../_shared/types'
import { generateId, requireOwner } from './_helpers'

interface ReactivateBody {
  user_id?: string
  csrf_token?: string
}

export const onRequestPost: PagesFunction<EnvBindings> = async ({ request, env }) => {
  let body: ReactivateBody
  try {
    body = (await request.json()) as ReactivateBody
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

  const target = await env.AUTH_DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first()
  if (!target) {
    return jsonError(404, 'not_found', 'User not found.')
  }

  const nowIso = new Date().toISOString()
  await env.AUTH_DB
    .prepare('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?')
    .bind(nowIso, userId)
    .run()

  await writeAuditEvent(env.AUTH_DB, {
    id: generateId('audit'),
    actorUserId: owner.session.userId,
    action: 'admin_reactivate_user',
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
