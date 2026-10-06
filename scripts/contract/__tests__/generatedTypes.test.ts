import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { SCHEMA_PATH, TYPES_PATH, generateSnapshotTypes } from '../lib/syncContract'

it('commits the types generated from the committed producer schema', async () => {
  const generated = await generateSnapshotTypes(readFileSync(SCHEMA_PATH, 'utf8'))

  expect(readFileSync(TYPES_PATH, 'utf8'), 'run `npm run contract:sync` instead of editing the generated types').toBe(generated)
})
