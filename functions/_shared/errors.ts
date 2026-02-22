import type { ErrorEnvelope } from './types'

export function jsonError(status: number, code: string, message: string): Response {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
    },
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
