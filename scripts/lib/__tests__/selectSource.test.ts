import { describe, expect, it } from 'vitest'

import { r2Source } from '../r2Source'
import { selectSource } from '../selectSource'

const CREDENTIALS = { R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret', CLOUDFLARE_ACCOUNT_ID: 'acct' }

describe('selectSource', () => {
  it("reads prod through the operator's wrangler login unless the R2 credentials are all set", () => {
    expect(selectSource({})).toBe(r2Source)
    expect(selectSource({ ...CREDENTIALS, R2_SECRET_ACCESS_KEY: undefined })).toBe(r2Source)
  })

  it('reads prod through the S3 API with the R2 credentials when all three are set', () => {
    const commands: string[] = []
    const source = selectSource(CREDENTIALS, (command) => {
      commands.push(command)
      return '{}'
    })

    source.read('latest.json')

    expect(commands).toEqual(['curl'])
  })
})
