const isDev = import.meta.env.DEV

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() ?? '',
  useMock: isDev && import.meta.env.VITE_USE_MOCK === 'true',
}
