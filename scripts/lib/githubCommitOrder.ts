import { execFileSync } from 'node:child_process'

import type { RunCommand } from './r2S3Source'

const PRODUCER = 'relomy/dk_results'
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/**
 * "Is `commit` the same as, or a descendant of, `base`?" on the producer's history, asked of GitHub's compare API
 * (dk_results is public, so no token). Only GET is sent. A refusal or an answer with no status throws: it is a setup
 * error, never a verdict.
 */
export function githubCommitOrder(
  run: RunCommand = (command, args, options) =>
    execFileSync(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] }),
): (commit: string, base: string) => boolean {
  return (commit, base) => {
    const url = `https://api.github.com/repos/${PRODUCER}/compare/${base}...${commit}`
    const failure = `Comparing ${base} with ${commit} on ${PRODUCER}`
    let body: string
    try {
      body = run(
        'curl',
        ['--silent', '--show-error', '--fail', '--header', 'Accept: application/vnd.github+json', url],
        {
          encoding: 'utf8',
          maxBuffer: MAX_RESPONSE_BYTES,
        },
      )
    } catch (error) {
      throw new Error(`${failure} failed (${describeCurlFailure(error)}).`)
    }
    const status = parseStatus(body)
    if (status === 'identical' || status === 'ahead') return true
    if (status === 'behind' || status === 'diverged') return false
    throw new Error(`${failure} gave no usable status.`)
  }
}

function parseStatus(body: string): unknown {
  try {
    return (JSON.parse(body) as { status?: unknown }).status
  } catch {
    return undefined
  }
}

/** Only the HTTP status or curl's own one-line reason: the error's text may carry the response or the command. */
function describeCurlFailure(error: unknown): string {
  const stderr = String((error as { stderr?: unknown }).stderr ?? '')
  const status = /returned error: (\d{3})/.exec(stderr)
  if (status) return `HTTP ${status[1]}`
  return /^curl: \(\d+\) [^\n]*/m.exec(stderr)?.[0] ?? 'curl failed'
}
