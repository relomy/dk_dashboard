import { describe, expect, it } from 'vitest'

import { GOLDENS_DIR, PIN_PATH, SCHEMA_PATH, TYPES_PATH, syncContract, type ContractFiles, type ProducerSource } from '../lib/syncContract'

const COMMIT = '6ae728d8062629852789c3ded7e6f663ca68fdf9'
const SCHEMA = JSON.stringify({
  title: 'SnapshotEnvelope',
  type: 'object',
  properties: { schema_version: { const: 3 }, generated_at: { type: 'string' } },
  required: ['schema_version', 'generated_at'],
  additionalProperties: false,
})

function producer(overrides: Partial<ProducerSource> = {}): ProducerSource & { reads: string[] } {
  const reads: string[] = []
  return {
    reads,
    readSchema: (commit) => (reads.push(`schema@${commit}`), SCHEMA),
    listGoldens: (commit) => (reads.push(`list@${commit}`), ['golf.json', 'nfl_mid_slate.json']),
    readGolden: (commit, name) => (reads.push(`${name}@${commit}`), `{"golden":"${name}"}\n`),
    ...overrides,
  }
}

function repo(existing: Record<string, string> = {}): ContractFiles & { files: Map<string, string> } {
  const files = new Map(Object.entries(existing))
  return {
    files,
    write: (path, text) => void files.set(path, text),
    remove: (path) => void files.delete(path),
    list: (dir) => [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).map((path) => path.slice(dir.length + 1)),
  }
}

describe('syncContract', () => {
  it('stores the producer schema and goldens at the commit, generates the types and records the pin', async () => {
    const files = repo()
    const source = producer()

    await syncContract(COMMIT, { source, files })

    expect(source.reads).toEqual([`schema@${COMMIT}`, `list@${COMMIT}`, `golf.json@${COMMIT}`, `nfl_mid_slate.json@${COMMIT}`])
    expect(files.files.get(SCHEMA_PATH)).toBe(SCHEMA)
    expect(files.files.get(`${GOLDENS_DIR}/golf.json`)).toBe('{"golden":"golf.json"}\n')
    expect(files.files.get(`${GOLDENS_DIR}/nfl_mid_slate.json`)).toBe('{"golden":"nfl_mid_slate.json"}\n')
    expect(JSON.parse(files.files.get(PIN_PATH) ?? '')).toEqual({ repo: 'relomy/dk_results', commit: COMMIT })

    const types = files.files.get(TYPES_PATH) ?? ''
    expect(types).toMatch(/^\/\* eslint-disable \*\/\n\/\*\*\n \* GENERATED FILE/)
    expect(types).toContain('export interface SnapshotEnvelope')
    expect(types).toContain('generated_at: string')
  })

  it('removes goldens the producer no longer has at the commit', async () => {
    const files = repo({ [`${GOLDENS_DIR}/retired.json`]: '{}', [`${GOLDENS_DIR}/golf.json`]: '{"old":true}' })

    await syncContract(COMMIT, { source: producer(), files })

    expect([...files.files.keys()].filter((path) => path.startsWith(GOLDENS_DIR)).sort()).toEqual([
      `${GOLDENS_DIR}/golf.json`,
      `${GOLDENS_DIR}/nfl_mid_slate.json`,
    ])
    expect(files.files.get(`${GOLDENS_DIR}/golf.json`)).toBe('{"golden":"golf.json"}\n')
  })

  it('leaves the repo untouched when a producer file cannot be fetched', async () => {
    const existing = { [SCHEMA_PATH]: 'old schema', [PIN_PATH]: 'old pin', [`${GOLDENS_DIR}/golf.json`]: 'old golden' }
    const files = repo(existing)
    const source = producer({
      readGolden: (_commit, name) => {
        if (name === 'nfl_mid_slate.json') throw new Error('HTTP 404')
        return '{}'
      },
    })

    await expect(syncContract(COMMIT, { source, files })).rejects.toThrow('HTTP 404')

    expect(Object.fromEntries(files.files)).toEqual(existing)
  })

  it('refuses a commit that is not a full SHA before reading anything', async () => {
    const source = producer()

    await expect(syncContract('main', { source, files: repo() })).rejects.toThrow(/full 40-character commit SHA/)

    expect(source.reads).toEqual([])
  })
})
