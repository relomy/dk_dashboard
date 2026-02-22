import type { AdminUser, AuthRole, AuthUser } from './types'

interface ApiErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

export class AuthApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  includeCsrf?: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

async function parseError(response: Response): Promise<AuthApiError> {
  let message = `Request failed (${response.status})`
  let code: string | undefined

  try {
    const payload = (await response.json()) as ApiErrorEnvelope
    if (payload?.error?.message) {
      message = payload.error.message
    }
    if (payload?.error?.code) {
      code = payload.error.code
    }
  } catch {
    // Leave default message.
  }

  return new AuthApiError(response.status, message, code)
}

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseError(response)
  }
  const payload = (await response.json()) as { csrf_token?: string }
  const token = typeof payload.csrf_token === 'string' ? payload.csrf_token.trim() : ''
  if (!token) {
    throw new Error('CSRF token response is invalid.')
  }
  return token
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const includeCsrf = options.includeCsrf ?? method !== 'GET'
  let csrfToken: string | null = null
  if (includeCsrf) {
    csrfToken = await fetchCsrfToken()
  }

  const headers: HeadersInit = {}
  let body: string | undefined
  if (options.body || csrfToken) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify({
      ...(options.body ?? {}),
      ...(csrfToken ? { csrf_token: csrfToken } : {}),
    })
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body,
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  return (await response.json()) as T
}

function parseAuthUser(value: unknown): AuthUser {
  if (!isObject(value)) {
    throw new Error('Invalid auth user response.')
  }

  const id = typeof value.id === 'string' ? value.id : ''
  const username = typeof value.username === 'string' ? value.username : ''
  const role = value.role === 'owner' || value.role === 'friend' ? (value.role as AuthRole) : null
  const mustChangePassword = value.must_change_password === true

  if (!id || !username || !role) {
    throw new Error('Auth user response is missing required fields.')
  }

  return {
    id,
    username,
    role,
    must_change_password: mustChangePassword,
  }
}

function parseAdminUser(value: unknown): AdminUser {
  if (!isObject(value)) {
    throw new Error('Invalid admin user response.')
  }

  const id = typeof value.id === 'string' ? value.id : ''
  const username = typeof value.username === 'string' ? value.username : ''
  const role = value.role === 'owner' || value.role === 'friend' ? (value.role as AuthRole) : null
  const isActive = value.is_active === true
  const mustChangePassword = value.must_change_password === true
  const lastLoginAt = typeof value.last_login_at === 'string' ? value.last_login_at : null

  if (!id || !username || !role) {
    throw new Error('Admin user response is missing required fields.')
  }

  return {
    id,
    username,
    role,
    is_active: isActive,
    must_change_password: mustChangePassword,
    last_login_at: lastLoginAt,
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
  })

  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw await parseError(response)
  }

  const payload = (await response.json()) as { user?: unknown }
  return parseAuthUser(payload.user)
}

export async function login(input: { username: string; password: string }): Promise<AuthUser> {
  const payload = await requestJson<{ user: unknown }>('/api/auth/login', {
    method: 'POST',
    body: {
      username: input.username,
      password: input.password,
    },
  })
  return parseAuthUser(payload.user)
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function changePassword(input: {
  currentPassword?: string
  newPassword: string
}): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: {
      ...(input.currentPassword ? { current_password: input.currentPassword } : {}),
      new_password: input.newPassword,
    },
  })
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const payload = await requestJson<{ users?: unknown[] }>('/api/admin/users', {
    method: 'GET',
    includeCsrf: false,
  })

  const users = Array.isArray(payload.users) ? payload.users : []
  return users.map((user) => parseAdminUser(user))
}

export async function createAdminUser(input: {
  username: string
  role: AuthRole
  temporaryPassword?: string
}): Promise<{ user: AdminUser; temporaryPassword: string }> {
  const payload = await requestJson<{ user: unknown; temporary_password?: unknown }>('/api/admin/users', {
    method: 'POST',
    body: {
      username: input.username,
      role: input.role,
      ...(input.temporaryPassword ? { temporary_password: input.temporaryPassword } : {}),
    },
  })
  const temp = typeof payload.temporary_password === 'string' ? payload.temporary_password : ''
  return {
    user: parseAdminUser(payload.user),
    temporaryPassword: temp,
  }
}

export async function resetAdminUserPassword(userId: string): Promise<{
  userId: string
  temporaryPassword: string
  tempPasswordExpiresAt: string
}> {
  const payload = await requestJson<{
    user_id?: unknown
    temporary_password?: unknown
    temp_password_expires_at?: unknown
  }>('/api/admin/users-reset-password', {
    method: 'POST',
    body: { user_id: userId },
  })

  return {
    userId: typeof payload.user_id === 'string' ? payload.user_id : userId,
    temporaryPassword: typeof payload.temporary_password === 'string' ? payload.temporary_password : '',
    tempPasswordExpiresAt:
      typeof payload.temp_password_expires_at === 'string' ? payload.temp_password_expires_at : '',
  }
}

export async function deactivateAdminUser(userId: string): Promise<void> {
  await requestJson<{ ok: boolean; user_id: string }>('/api/admin/users-deactivate', {
    method: 'POST',
    body: { user_id: userId },
  })
}

export async function reactivateAdminUser(userId: string): Promise<void> {
  await requestJson<{ ok: boolean; user_id: string }>('/api/admin/users-reactivate', {
    method: 'POST',
    body: { user_id: userId },
  })
}
