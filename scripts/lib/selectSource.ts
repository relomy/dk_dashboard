import { r2S3Source, type RunCommand } from './r2S3Source'
import { r2Source } from './r2Source'
import { hasR2Credentials, type SnapshotSource } from './snapshotSource'

/** The bucket-scoped R2 credentials when the environment has them (CI), else the operator's wrangler login. */
export function selectSource(env: Record<string, string | undefined>, run?: RunCommand): SnapshotSource {
  return hasR2Credentials(env) ? r2S3Source(env, run) : r2Source
}
