import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    env: {
      VITE_USE_MOCK: 'true',
      VITE_MOCK_SNAPSHOT_ONLY: 'false',
    },
    // Two projects, so logic tests don't pay for a jsdom environment they never use (it was about 0.5s a file).
    // A test file must match one of them; a new test folder needs an `include` entry here, or it never runs.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['{functions,scripts,src/lib}/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
          include: ['src/test/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
