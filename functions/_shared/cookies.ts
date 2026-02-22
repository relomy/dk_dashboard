const COOKIE_SPLIT = ';'

function encodeCookieComponent(value: string): string {
  return encodeURIComponent(value)
}

function decodeCookieComponent(value: string): string {
  return decodeURIComponent(value)
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(COOKIE_SPLIT)) {
    const [cookieName, ...rest] = part.trim().split('=')
    if (cookieName === name) {
      const value = rest.join('=')
      return value ? decodeCookieComponent(value) : ''
    }
  }

  return null
}

export function buildCookie(
  name: string,
  value: string,
  options: {
    maxAgeSeconds?: number
    path?: string
    sameSite?: 'Lax' | 'Strict' | 'None'
    httpOnly?: boolean
    secure?: boolean
  } = {},
): string {
  const parts = [`${name}=${encodeCookieComponent(value)}`]

  parts.push(`Path=${options.path ?? '/'}`)

  if (typeof options.maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  }

  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)

  if (options.httpOnly) {
    parts.push('HttpOnly')
  }

  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}
