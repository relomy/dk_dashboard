import { execFileSync } from 'node:child_process'

import type { SnapshotSource } from './snapshotSource'

const BUCKET = 'dk-dashboard-data'
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024

export type RunCommand = (
  command: string,
  args: string[],
  options: { input?: string; encoding: 'utf8'; maxBuffer: number },
) => string

/**
 * Read-only access to the prod R2 bucket through its S3-compatible API, with a bucket-scoped access key
 * (`curl --aws-sigv4`, so there is no signing code or dependency). Only GET is ever sent. The credentials
 * go to curl on stdin, so they never appear in a process listing.
 */
export function r2S3Source(
  env: Record<string, string | undefined>,
  run: RunCommand = (command, args, options) =>
    execFileSync(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] }),
): SnapshotSource {
  const { R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, CLOUDFLARE_ACCOUNT_ID: accountId } = env
  return {
    isLoggedIn: () => true,
    read(key) {
      const url = `https://${accountId}.r2.cloudflarestorage.com/${BUCKET}/${key}`
      const config = `user = "${accessKeyId}:${secretAccessKey}"\n`
      try {
        return run(
          'curl',
          ['--silent', '--show-error', '--fail', '--aws-sigv4', 'aws:amz:auto:s3', '--config', '-', url],
          {
            input: config,
            encoding: 'utf8',
            maxBuffer: MAX_SNAPSHOT_BYTES,
          },
        )
      } catch (error) {
        throw new Error(`Reading ${key} from R2 failed (${describeCurlFailure(error)}).`)
      }
    },
  }
}

/** Only the HTTP status or curl's own one-line reason: the error's text may carry the response or the command. */
function describeCurlFailure(error: unknown): string {
  const stderr = String((error as { stderr?: unknown }).stderr ?? '')
  const status = /returned error: (\d{3})/.exec(stderr)
  if (status) return `HTTP ${status[1]}`
  return /^curl: \(\d+\) [^\n]*/m.exec(stderr)?.[0] ?? 'curl failed'
}
