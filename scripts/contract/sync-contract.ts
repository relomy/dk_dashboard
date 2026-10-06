// Takes the producer's published contract (relomy/dk_results) at a commit: the exported JSON Schema and
// golden envelopes are stored in contract/, the snapshot types are generated from the schema, and the
// pin in contract/producer-pin.json is updated. The producer repository is public; no credentials.
// Usage: npm run contract:sync              (re-sync at the commit already pinned)
//        npm run contract:sync -- <sha>     (take a new producer commit)
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { githubProducerSource } from './lib/githubProducerSource'
import { PIN_PATH, syncContract, type ContractFiles } from './lib/syncContract'

const files: ContractFiles = {
  write(file, text) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  },
  remove: (file) => rmSync(file, { force: true }),
  list(dir) {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  },
}

async function main(): Promise<void> {
  const commit = process.argv[2] ?? (JSON.parse(readFileSync(PIN_PATH, 'utf8')) as { commit: string }).commit
  await syncContract(commit, { source: githubProducerSource, files })
  console.log(`Synced the producer contract at ${commit}.`)
  console.log('Review `git diff contract src/lib/generated`, then run `npm test` and `npm run build`.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`contract:sync failed: ${message}`)
  process.exit(1)
})
