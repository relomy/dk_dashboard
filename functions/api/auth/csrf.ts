import { buildCookie } from '../../_shared/cookies'
import type { EnvBindings } from '../../_shared/types'

const CSRF_COOKIE = 'csrf_token'
const SESSION_TTL_SECONDS = 8 * 60 * 60

function randomToken(bytes = 24): string {
  const tokenBytes = new Uint8Array(bytes)
  crypto.getRandomValues(tokenBytes)

  let binary = ''
  for (const byte of tokenBytes) {
    binary += String.fromCharCode(byte)
  }

  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request }) => {
  const token = randomToken()
  const secure = new URL(request.url).protocol === 'https:'

  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  headers.append(
    'set-cookie',
    buildCookie(CSRF_COOKIE, token, {
      maxAgeSeconds: SESSION_TTL_SECONDS,
      sameSite: 'Lax',
      secure,
      httpOnly: false,
    }),
  )

  return new Response(JSON.stringify({ csrf_token: token }), {
    status: 200,
    headers,
  })
}
