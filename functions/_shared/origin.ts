import type { EnvBindings } from './types'

export type OriginValidationResult =
  | { ok: true; origin: string }
  | {
      ok: false
      status: 403
      code: 'csrf_failed'
      message: string
    }

function normalizeCsvOrigins(input: string | undefined): string[] {
  if (!input) {
    return []
  }
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function extractOriginFromReferer(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isLocalhostOrigin(origin: string): boolean {
  return /^http:\/\/localhost(?::\d+)?$/i.test(origin)
}

export function validateStateChangingOrigin(
  request: Request,
  env: Partial<Pick<EnvBindings, 'ALLOWED_ORIGINS'>>,
): OriginValidationResult {
  const requestOrigin = request.headers.get('origin')?.trim() || extractOriginFromReferer(request.headers.get('referer'))
  if (!requestOrigin) {
    return {
      ok: false,
      status: 403,
      code: 'csrf_failed',
      message: 'Invalid request origin.',
    }
  }

  const hostOrigin = new URL(request.url).origin
  const allowlist = new Set<string>([hostOrigin, ...normalizeCsvOrigins(env.ALLOWED_ORIGINS)])

  if (allowlist.has(requestOrigin) || isLocalhostOrigin(requestOrigin)) {
    return {
      ok: true,
      origin: requestOrigin,
    }
  }

  return {
    ok: false,
    status: 403,
    code: 'csrf_failed',
    message: 'Invalid request origin.',
  }
}
