const isDev = import.meta.env.DEV

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() ?? '',
  useMock: isDev && import.meta.env.VITE_USE_MOCK === 'true',
  mockSnapshotOnly: isDev && import.meta.env.VITE_MOCK_SNAPSHOT_ONLY === 'true',
  mockSnapshotPath: import.meta.env.VITE_MOCK_SNAPSHOT_PATH?.trim() || 'snapshots/canonical-live-snapshot.v2.json',
}
