import { requireAuthenticatedSession } from '../../_shared/sessionAuth'
import type { EnvBindings } from '../../_shared/types'

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return auth.response
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
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  )
}
