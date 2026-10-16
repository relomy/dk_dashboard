import { guardProdRead, type ProdReadDeps } from '../../lib/snapshotSource'
import { trimSnapshot, type TrimCount } from './trimSnapshot'

/** Where captures land: outside `public/`, so the site build never ships them. The contract suite reads every file here. */
export const PROD_FIXTURES_DIR = 'contract/prod-fixtures'

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
  const fixturePath = `${PROD_FIXTURES_DIR}/${key}`
  deps.writeFixture(fixturePath, text)
  return { fixturePath, counts }
}
