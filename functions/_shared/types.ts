export interface EnvBindings {
  dk_dashboard_data: R2Bucket
  DASHBOARD_API_KEY?: string
  SESSION_PEPPER?: string
  ALLOWED_ORIGINS?: string
  AUTH_DB: D1Database
}

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
  }
}

export type AuthResult =
  | { ok: true }
  | {
      ok: false
      status: 401 | 500
      code: string
      message: string
    }

export type ValidationResult =
  | { ok: true }
  | {
      ok: false
      status: 403 | 500
      code: string
      message: string
    }

export type ConfigResult =
  | { ok: true; value: string }
  | {
      ok: false
      status: 500
      code: 'server_misconfigured'
      message: string
    }
