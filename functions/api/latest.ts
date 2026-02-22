import { authorizeRequest } from '../_shared/auth'
import { jsonError } from '../_shared/errors'
import type { EnvBindings } from '../_shared/types'

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const auth = authorizeRequest(request.headers, env)
  if (!auth.ok) {
    return jsonError(auth.status, auth.code, auth.message)
  }

  const latestObject = await env.dk_dashboard_data.get('latest.json')
  if (!latestObject) {
    return jsonError(404, 'latest_not_found', 'latest.json not found in storage.')
  }

  return new Response(await latestObject.text(), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
