const isDev = import.meta.env.DEV
const isTest = import.meta.env.MODE === 'test'

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() ?? '',
  useMock: !isTest && isDev && import.meta.env.VITE_USE_MOCK === 'true',
  mockSnapshotOnly: !isTest && isDev && import.meta.env.VITE_MOCK_SNAPSHOT_ONLY === 'true',
  mockSnapshotPath: import.meta.env.VITE_MOCK_SNAPSHOT_PATH?.trim() || 'snapshots/canonical-live-snapshot.v3.json',
}
