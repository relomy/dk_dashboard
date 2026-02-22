import { jsonError } from '../_shared/errors'
import { validateSnapshotPath } from '../_shared/path'
import { requireAuthenticatedSession } from '../_shared/sessionAuth'
import type { EnvBindings } from '../_shared/types'

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env }) => {
  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return auth.response
  }

  const requestedPath = new URL(request.url).searchParams.get('path')
  const key = validateSnapshotPath(requestedPath)
  if (!key) {
    return jsonError(400, 'invalid_path', 'Invalid path. Use snapshots/* or manifest/* keys only.')
  }

  const snapshotObject = await env.dk_dashboard_data.get(key)
  if (!snapshotObject) {
    return jsonError(404, 'snapshot_not_found', `Not found: ${key}`)
  }

  return new Response(await snapshotObject.text(), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': key.startsWith('snapshots/') ? 'public, max-age=60' : 'no-store',
    },
  })
}
