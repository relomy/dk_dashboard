import { compile } from 'json-schema-to-typescript'

export const PRODUCER_REPO = 'relomy/dk_results'
export const PIN_PATH = 'contract/producer-pin.json'
export const SCHEMA_PATH = 'contract/snapshot.schema.json'
export const GOLDENS_DIR = 'contract/goldens'
export const TYPES_PATH = 'src/lib/generated/snapshot.ts'

const FULL_SHA = /^[0-9a-f]{40}$/

/** The producer's published contract artifacts at a commit. */
export interface ProducerSource {
  readSchema(commit: string): string | Promise<string>
  listGoldens(commit: string): string[] | Promise<string[]>
  readGolden(commit: string, name: string): string | Promise<string>
}

/** The dashboard repository's files, as paths relative to its root. */
export interface ContractFiles {
  write(path: string, text: string): void
  remove(path: string): void
  /** File names directly under `dir`. */
  list(dir: string): string[]
}

export interface SyncDeps {
  source: ProducerSource
  files: ContractFiles
}

const BANNER = `/* eslint-disable */
/**
 * GENERATED FILE: do not edit. Run \`npm run contract:sync\` to regenerate it from
 * ${SCHEMA_PATH}, the schema relomy/dk_results exports.
 */`

/** The snapshot types for a producer schema; a pure function of the schema text. */
export async function generateSnapshotTypes(schemaText: string): Promise<string> {
  return compile(JSON.parse(schemaText), 'Snapshot', {
    bannerComment: BANNER,
    additionalProperties: false,
  })
}

/**
 * Takes the producer's contract at `commit`: stores its exported schema and golden envelopes, generates
 * the snapshot types from the schema, and records the pin. Everything is fetched and generated before
 * any file is touched, so a failure leaves the repository as it was.
 */
export async function syncContract(commit: string, { source, files }: SyncDeps): Promise<void> {
  if (!FULL_SHA.test(commit)) {
    throw new Error(`Expected a full 40-character commit SHA, got "${commit}".`)
  }

  const schema = await source.readSchema(commit)
  const goldenNames = await source.listGoldens(commit)
  const goldens = new Map<string, string>()
  for (const name of goldenNames) goldens.set(name, await source.readGolden(commit, name))
  const types = await generateSnapshotTypes(schema)

  files.write(SCHEMA_PATH, schema)
  for (const stale of files.list(GOLDENS_DIR)) {
    if (!goldens.has(stale)) files.remove(`${GOLDENS_DIR}/${stale}`)
  }
  for (const [name, text] of goldens) files.write(`${GOLDENS_DIR}/${name}`, text)
  files.write(TYPES_PATH, types)
  files.write(PIN_PATH, `${JSON.stringify({ repo: PRODUCER_REPO, commit }, null, 2)}\n`)
}
