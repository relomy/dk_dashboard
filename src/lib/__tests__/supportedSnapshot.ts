import { interpretSnapshot, isSupportedSnapshot, type LiveSnapshot } from '../interpretedSnapshot'

/** A raw snapshot as the snapshot module hands it to the Live code: interpreted, and known to be supported. */
export function supported(raw: unknown): LiveSnapshot {
  const snapshot = interpretSnapshot(raw)
  if (!isSupportedSnapshot(snapshot)) throw new Error('Test input is not a supported snapshot')
  return snapshot
}
