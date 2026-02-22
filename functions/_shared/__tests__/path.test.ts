import { describe, expect, it } from 'vitest'
import { validateSnapshotPath } from '../path'

describe('validateSnapshotPath', () => {
  it('accepts snapshots and manifest paths', () => {
    expect(validateSnapshotPath('snapshots/live.json')).toBe('snapshots/live.json')
    expect(validateSnapshotPath('manifest/2026-02-22.json')).toBe('manifest/2026-02-22.json')
  })

  it('rejects empty, absolute, traversal, and unknown prefixes', () => {
    expect(validateSnapshotPath(null)).toBeNull()
    expect(validateSnapshotPath('   ')).toBeNull()
    expect(validateSnapshotPath('/snapshots/live.json')).toBeNull()
    expect(validateSnapshotPath('../secrets.json')).toBeNull()
    expect(validateSnapshotPath('foo/bar.json')).toBeNull()
  })

  it('rejects encoded traversal and encoded slash abuse', () => {
    expect(validateSnapshotPath('snapshots/%2e%2e/secret.json')).toBeNull()
    expect(validateSnapshotPath('snapshots/%252e%252e/secret.json')).toBeNull()
    expect(validateSnapshotPath('snap%2Fshots/live.json')).toBeNull()
  })
})
