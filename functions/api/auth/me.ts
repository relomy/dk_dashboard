import { buildCookie, readCookie } from '../../_shared/cookies'
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '../../_shared/session'
import { requireAuthenticatedSession } from '../../_shared/sessionAuth'
import type { EnvBindings } from '../../_shared/types'

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return auth.response
  }

  // Slide the browser cookie along with the server-side expiry (see requireAuthenticatedSession).
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  const sessionToken = readCookie(request, SESSION_COOKIE)
  if (sessionToken) {
    headers.append(
      'set-cookie',
      buildCookie(SESSION_COOKIE, sessionToken, {
        maxAgeSeconds: SESSION_TTL_SECONDS,
        sameSite: 'Lax',
        secure: new URL(request.url).protocol === 'https:',
        httpOnly: true,
      }),
    )
  }

  return new Response(
    JSON.stringify({
      user: {
        id: auth.session.userId,
        username: auth.session.username,
        role: auth.session.role,
        must_change_password: auth.session.mustChangePassword,
      },
    }),
    { status: 200, headers },
  )
}
