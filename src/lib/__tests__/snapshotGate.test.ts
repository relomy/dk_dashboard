import { describe, expect, it } from 'vitest'
import {
  interpretSnapshot,
  isSupportedSnapshot,
  unsupportedSnapshotMessage,
  unsupportedVersion,
} from '../interpretedSnapshot'

const envelope = (version: unknown) => interpretSnapshot({ schema_version: version, sports: {} })

describe('snapshot version gate', () => {
  it('supports schema version 3 only', () => {
    expect(isSupportedSnapshot(envelope(3))).toBe(true)
    expect(isSupportedSnapshot(envelope(2))).toBe(false)
    expect(isSupportedSnapshot(envelope('3'))).toBe(false)
    expect(isSupportedSnapshot(interpretSnapshot({ sports: {} }))).toBe(false)
  })

  it('names the version in the shared message, and "unknown" when there is none', () => {
    expect(unsupportedSnapshotMessage(unsupportedVersion(envelope(2)))).toBe('Unsupported snapshot schema version: 2.')
    expect(unsupportedSnapshotMessage(unsupportedVersion(interpretSnapshot({})))).toBe(
      'Unsupported snapshot schema version: unknown.',
    )
  })
})
