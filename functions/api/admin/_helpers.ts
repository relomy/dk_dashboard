import { validateCsrfDoubleSubmit } from '../../_shared/csrf'
import { jsonError } from '../../_shared/errors'
import { validateStateChangingOrigin } from '../../_shared/origin'
import { requireAuthenticatedSession, type AuthenticatedSession } from '../../_shared/sessionAuth'
import type { EnvBindings } from '../../_shared/types'

export type OwnerGuardResult =
  | { ok: true; session: AuthenticatedSession }
  | { ok: false; response: Response }

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

export function generateId(prefix: string): string {
  return `${prefix}_${randomToken(16)}`
}

export function generateTempPassword(length = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let password = ''
  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length]
  }
  return password
}

export async function requireOwner(
  request: Request,
  env: EnvBindings,
  options: { csrfBodyToken?: string | null; requireCsrf?: boolean } = {},
): Promise<OwnerGuardResult> {
  if (options.requireCsrf ?? true) {
    const originCheck = validateStateChangingOrigin(request, env)
    if (!originCheck.ok) {
      return { ok: false, response: jsonError(originCheck.status, originCheck.code, originCheck.message) }
    }

    const csrfCheck = validateCsrfDoubleSubmit(request, { bodyToken: options.csrfBodyToken ?? undefined })
    if (!csrfCheck.ok) {
      return { ok: false, response: jsonError(csrfCheck.status, csrfCheck.code, csrfCheck.message) }
    }
  }

  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return { ok: false, response: auth.response }
  }

  if (auth.session.role !== 'owner') {
    return { ok: false, response: jsonError(403, 'forbidden', 'Owner access required.') }
  }

  return {
    ok: true,
    session: auth.session,
  }
}

export function plusHours(isoNow: string, hours: number): string {
  return new Date(new Date(isoNow).getTime() + hours * 60 * 60 * 1000).toISOString()
}
