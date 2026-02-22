import type { AuthResult, EnvBindings } from './types'

export function authorizeRequest(
  headers: Headers,
  env: Partial<Pick<EnvBindings, 'DASHBOARD_API_KEY'>>,
): AuthResult {
  const configuredKey = env.DASHBOARD_API_KEY?.trim()
  if (!configuredKey) {
    return {
      ok: false,
      status: 500,
      code: 'server_misconfigured',
      message: 'DASHBOARD_API_KEY is not configured.',
    }
  }

  const suppliedKey = headers.get('X-Api-Key')?.trim()
  if (!suppliedKey || suppliedKey !== configuredKey) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'Invalid or missing API key.',
    }
  }

  return { ok: true }
}
