export interface EnvBindings {
  dk_dashboard_data: R2Bucket
  DASHBOARD_API_KEY?: string
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
