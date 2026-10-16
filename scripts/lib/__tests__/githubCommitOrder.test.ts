import { describe, expect, it } from 'vitest'

import { githubCommitOrder } from '../githubCommitOrder'
import type { RunCommand } from '../r2S3Source'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const BASE = 'fedcba9876543210fedcba9876543210fedcba98'

/** A fake curl: records the call and answers with the compare API's body, or fails like curl does. */
function curl(answer: string | { stderr: string }) {
  const calls: Array<{ command: string; args: string[] }> = []
  const run: RunCommand = (command, args) => {
    calls.push({ command, args })
    if (typeof answer !== 'string') throw Object.assign(new Error('Command failed: curl ...'), answer)
    return answer
  }
  return { calls, run }
}

describe('githubCommitOrder', () => {
  it.each([
    ['identical', true],
    ['ahead', true],
    ['behind', false],
    ['diverged', false],
  ])('says %s means %s', (status, expected) => {
    const fake = curl(JSON.stringify({ status }))

    expect(githubCommitOrder(fake.run)(COMMIT, BASE)).toBe(expected)
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].command).toBe('curl')
    expect(fake.calls[0].args).toContain(`https://api.github.com/repos/relomy/dk_results/compare/${BASE}...${COMMIT}`)
  })

  it('fails with the HTTP status when GitHub refuses, not with a verdict', () => {
    const fake = curl({ stderr: 'curl: (22) The requested URL returned error: 404' })

    expect(() => githubCommitOrder(fake.run)(COMMIT, BASE)).toThrow(
      `Comparing ${BASE} with ${COMMIT} on relomy/dk_results failed (HTTP 404).`,
    )
  })

  it('fails when the answer has no known status', () => {
    expect(() => githubCommitOrder(curl('{"message":"x"}').run)(COMMIT, BASE)).toThrow(
      `Comparing ${BASE} with ${COMMIT} on relomy/dk_results gave no usable status.`,
    )
  })
})
