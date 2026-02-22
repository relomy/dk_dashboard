import { writeAuditEvent } from '../../_shared/audit'
import { createUser } from '../../_shared/authRepo'
import { jsonError } from '../../_shared/errors'
import { hashPassword } from '../../_shared/password'
import type { EnvBindings } from '../../_shared/types'
import { generateId, generateTempPassword, plusHours, requireOwner } from './_helpers'

interface CreateUserBody {
  username?: string
  role?: 'owner' | 'friend'
  temporary_password?: string
  csrf_token?: string
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toLowerCase()
}

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const owner = await requireOwner(request, env, { requireCsrf: false })
  if (!owner.ok) {
    return owner.response
  }

  const rows = await env.AUTH_DB
    .prepare('SELECT id, username, role, is_active, must_change_password, last_login_at FROM users ORDER BY username ASC')
    .bind()
    .all<{
      id: string
      username: string
      role: 'owner' | 'friend'
      is_active: number
      must_change_password: number
      last_login_at: string | null
    }>()

  return new Response(
    JSON.stringify({
      users: rows.results.map((row) => ({
        id: row.id,
        username: row.username,
        role: row.role,
        is_active: asBoolean(row.is_active),
        must_change_password: asBoolean(row.must_change_password),
        last_login_at: row.last_login_at,
      })),
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

export const onRequestPost: PagesFunction<EnvBindings> = async ({ request, env }) => {
  let body: CreateUserBody
  try {
    body = (await request.json()) as CreateUserBody
  } catch {
    return jsonError(400, 'invalid_request', 'Invalid JSON body.')
  }

  const owner = await requireOwner(request, env, { csrfBodyToken: body.csrf_token })
  if (!owner.ok) {
    return owner.response
  }

  const username = normalizeUsername(body.username)
  if (!username) {
    return jsonError(400, 'invalid_request', 'Username is required.')
  }

  const role = body.role === 'owner' || body.role === 'friend' ? body.role : null
  if (!role) {
    return jsonError(400, 'invalid_request', 'Role must be owner or friend.')
  }

  const existing = await env.AUTH_DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
  if (existing) {
    return jsonError(409, 'user_exists', 'Username already exists.')
  }

  const nowIso = new Date().toISOString()
  const temporaryPassword = typeof body.temporary_password === 'string' && body.temporary_password.length >= 12
    ? body.temporary_password
    : generateTempPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const userId = generateId('usr')
  const tempPasswordExpiresAt = plusHours(nowIso, 24)

  await createUser(env.AUTH_DB, {
    id: userId,
    username,
    passwordHash,
    role,
    isActive: true,
    mustChangePassword: true,
    tempPasswordExpiresAt,
    createdAt: nowIso,
    updatedAt: nowIso,
  })

  await writeAuditEvent(env.AUTH_DB, {
    id: generateId('audit'),
    actorUserId: owner.session.userId,
    action: 'admin_create_user',
    targetUserId: userId,
    metadataJson: JSON.stringify({ role }),
    ipHash: null,
    userAgent: request.headers.get('user-agent'),
    createdAt: nowIso,
  })

  return new Response(
    JSON.stringify({
      user: {
        id: userId,
        username,
        role,
        is_active: true,
        must_change_password: true,
        temp_password_expires_at: tempPasswordExpiresAt,
      },
      temporary_password: temporaryPassword,
    }),
    {
      status: 201,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  )
}
