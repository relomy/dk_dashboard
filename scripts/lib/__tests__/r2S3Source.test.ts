import { describe, expect, it } from 'vitest'

import { r2S3Source, type RunCommand } from '../r2S3Source'

const ENV = { R2_ACCESS_KEY_ID: 'AKIDEXAMPLE0123', R2_SECRET_ACCESS_KEY: 'sEcReT/value+0123', CLOUDFLARE_ACCOUNT_ID: 'acct123' }
const KEY = 'snapshots/live-2026-10-04T18-41-34Z.json'

interface Call {
  command: string
  args: string[]
  input: string | undefined
}

function fakeRun(respond: (call: Call) => string): RunCommand & { calls: Call[] } {
  const calls: Call[] = []
  const run: RunCommand = (command, args, options) => {
    const call = { command, args, input: options.input }
    calls.push(call)
    return respond(call)
  }
  return Object.assign(run, { calls })
}

describe('r2S3Source', () => {
  it('reads an object with a signed GET to the bucket on the account endpoint and returns its body', () => {
    const run = fakeRun(() => '{"ok":true}')

    const text = r2S3Source(ENV, run).read(KEY)

    expect(text).toBe('{"ok":true}')
    expect(run.calls).toHaveLength(1)
    const { command, args, input } = run.calls[0]
    expect(command).toBe('curl')
    expect(args).toContain(`https://acct123.r2.cloudflarestorage.com/dk-dashboard-data/${KEY}`)
    expect(args.join(' ')).toContain('--aws-sigv4 aws:amz:auto:s3')
    // The credentials go to curl on stdin, so they never show in a process listing.
    expect(args.join(' ')).not.toContain(ENV.R2_ACCESS_KEY_ID)
    expect(args.join(' ')).not.toContain(ENV.R2_SECRET_ACCESS_KEY)
    expect(input).toContain(`user = "${ENV.R2_ACCESS_KEY_ID}:${ENV.R2_SECRET_ACCESS_KEY}"`)
  })

  it('fails naming the object and the status, without the credentials or anything the response said', () => {
    const run = fakeRun(() => {
      const error = new Error(`Command failed: curl --user ${ENV.R2_ACCESS_KEY_ID}:${ENV.R2_SECRET_ACCESS_KEY}`)
      Object.assign(error, { stderr: 'curl: (22) The requested URL returned error: 403\n<Error>SignatureDoesNotMatch</Error>' })
      throw error
    })

    let message = ''
    try {
      r2S3Source(ENV, run).read(KEY)
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain(KEY)
    expect(message).toContain('403')
    expect(message).not.toContain(ENV.R2_ACCESS_KEY_ID)
    expect(message).not.toContain(ENV.R2_SECRET_ACCESS_KEY)
    expect(message).not.toContain('SignatureDoesNotMatch')
  })
})
