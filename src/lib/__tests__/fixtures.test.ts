import { expect, test } from 'vitest'
import latest from '../../../public/mock/latest.json'

test('mock latest has required fields', () => {
  expect(latest.latest_snapshot_path).toBeTruthy()
  expect(latest.manifest_today_path).toBeTruthy()
})
