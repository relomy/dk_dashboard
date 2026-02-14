import { config } from './env'
import type { LatestResponse } from './types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  apiKey?: string
  retries?: number
  timeoutMs?: number
}

export function createMockLatestSnapshotOnlyResponse(
  snapshotPath: string,
  nowIso = new Date().toISOString(),
): LatestResponse {
  return {
    latest_snapshot_path: snapshotPath,
    snapshot_at: nowIso,
    generated_at: nowIso,
    available_sports: [],
    // Empty path indicates history manifests are intentionally unavailable in this mode.
    manifest_today_path: '',
  }
}

export function buildApiUrl(path: string, opts?: { useMock?: boolean }): string {
  const useMock = opts?.useMock ?? config.useMock
  const withBase = (target: string): string => {
    if (!config.apiBaseUrl) {
      return target
    }
    return `${config.apiBaseUrl.replace(/\/$/, '')}${target}`
  }

  if (useMock && path === '/api/latest') {
    return withBase('/mock/latest.json')
  }

  if (useMock && path.startsWith('/api/snapshot?path=')) {
    const url = new URL(path, 'http://local.dev')
    const snapshotPath = url.searchParams.get('path')

    if (snapshotPath) {
      return withBase(`/mock/${snapshotPath}`)
    }
  }

  if (useMock && path.startsWith('/api/')) {
    return withBase(path.replace('/api/', '/mock/'))
  }

  return withBase(path)
}

export async function fetchJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (config.useMock && config.mockSnapshotOnly && path === '/api/latest') {
    return createMockLatestSnapshotOnlyResponse(config.mockSnapshotPath) as T
  }

  const retries = options.retries ?? 1
  const timeoutMs = options.timeoutMs ?? 10_000

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(buildApiUrl(path), {
        headers: {
          ...(options.apiKey ? { 'X-Api-Key': options.apiKey } : {}),
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        const isAuthError = response.status === 401 || response.status === 403
        const message = isAuthError
          ? 'Invalid or expired access key. Update your key and try again.'
          : `Request failed (${response.status})`
        throw new ApiError(message, response.status)
      }

      return (await response.json()) as T
    } catch (error) {
      lastError = error

      const isApiError = error instanceof ApiError
      const isAuthError = isApiError && (error.status === 401 || error.status === 403)

      if (isAuthError || attempt >= retries) {
        break
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  if (lastError instanceof ApiError) {
    throw lastError
  }

  if (lastError instanceof Error && lastError.name === 'AbortError') {
    throw new Error('Request timed out. Please try again.')
  }

  throw new Error('Network error. Please try again.')
}
