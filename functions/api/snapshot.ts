import { jsonError } from '../_shared/errors'
import { validateSnapshotPath } from '../_shared/path'
import { requireAuthenticatedSession } from '../_shared/sessionAuth'
import type { EnvBindings } from '../_shared/types'

const BROWSER_CACHE_CONTROL = 'private, max-age=31536000, immutable'
// Stored edge copies must expire before the 30-day R2 lifecycle rule deletes the object.
const EDGE_CACHE_CONTROL = 'public, max-age=86400'
const CACHE_STATUS_HEADER = 'x-snapshot-cache'

function snapshotResponse(body: BodyInit, cacheControl: string, cacheStatus?: 'hit' | 'miss'): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
  })
  if (cacheStatus) {
    headers.set(CACHE_STATUS_HEADER, cacheStatus)
  }
  return new Response(body, { headers })
}

export const onRequestGet: PagesFunction<EnvBindings> = async ({ request, env, waitUntil }) => {
  const auth = await requireAuthenticatedSession(request, env)
  if (!auth.ok) {
    return auth.response
  }

  const requestedPath = new URL(request.url).searchParams.get('path')
  const key = validateSnapshotPath(requestedPath)
  if (!key) {
    return jsonError(400, 'invalid_path', 'Invalid path. Use snapshots/* or manifest/* keys only.')
  }

  if (!key.startsWith('snapshots/')) {
    const manifestObject = await env.dk_dashboard_data.get(key)
    if (!manifestObject) {
      return jsonError(404, 'snapshot_not_found', `Not found: ${key}`)
    }
    return snapshotResponse(await manifestObject.text(), 'no-store')
  }

  // The lookup happens only after the session check above, so a public edge copy is never reachable unauthenticated.
  // The WebWorker lib's CacheStorage lacks the Workers-only `default` cache.
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(request.url)
  const cached = await cache.match(cacheKey)
  if (cached) {
    return snapshotResponse(await cached.text(), BROWSER_CACHE_CONTROL, 'hit')
  }

  const snapshotObject = await env.dk_dashboard_data.get(key)
  if (!snapshotObject) {
    return jsonError(404, 'snapshot_not_found', `Not found: ${key}`)
  }

  const body = await snapshotObject.text()
  waitUntil(cache.put(cacheKey, snapshotResponse(body, EDGE_CACHE_CONTROL)).catch(() => undefined))
  return snapshotResponse(body, BROWSER_CACHE_CONTROL, 'miss')
}
