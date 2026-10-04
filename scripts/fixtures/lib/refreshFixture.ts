import { guardProdRead, type ProdReadDeps } from '../../lib/snapshotSource'
import { trimSnapshot, type TrimCount } from './trimSnapshot'

export interface RefreshDeps extends ProdReadDeps {
  writeFixture(path: string, text: string): void
}

export interface RefreshResult {
  fixturePath: string
  counts: TrimCount[]
}

export function refreshFixture(key: string, deps: RefreshDeps): RefreshResult {
  guardProdRead({ task: 'The fixture refresh', key }, deps)

  const { text, counts } = trimSnapshot(deps.source.read(key))
  const fixturePath = `public/mock/${key}`
  deps.writeFixture(fixturePath, text)
  return { fixturePath, counts }
}
