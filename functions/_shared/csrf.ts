import type { ValidationResult } from './types'

interface CsrfOptions {
  cookieName?: string
  headerName?: string
  bodyToken?: string | null
}

export type CsrfValidationResult =
  | { ok: true; token: string }
  | {
      ok: false
      status: 403
      code: 'csrf_failed'
      message: string
    }

function parseCookieValue(cookieHeader: string | null, targetName: string): string | null {
  if (!cookieHeader) {
    return null
  }

  for (const entry of cookieHeader.split(';')) {
    const [name, ...rest] = entry.trim().split('=')
    if (name === targetName) {
      return rest.join('=')
    }
  }

  return null
}

export function csrfFailed(message = 'Invalid CSRF token.'): ValidationResult {
  return {
    ok: false,
    status: 403,
    code: 'csrf_failed',
    message,
  }
}

export function validateCsrfDoubleSubmit(request: Request, options: CsrfOptions = {}): CsrfValidationResult {
  const cookieName = options.cookieName ?? 'csrf_token'
  const headerName = options.headerName ?? 'x-csrf-token'

  const cookieToken = parseCookieValue(request.headers.get('cookie'), cookieName)
  const headerToken = request.headers.get(headerName)
  const bodyToken = options.bodyToken?.trim() || null
  const requestToken = headerToken?.trim() || bodyToken

  if (!cookieToken || !requestToken || cookieToken !== requestToken) {
    return {
      ok: false,
      status: 403,
      code: 'csrf_failed',
      message: 'Invalid CSRF token.',
    }
  }

  return {
    ok: true,
    token: cookieToken,
  }
}
