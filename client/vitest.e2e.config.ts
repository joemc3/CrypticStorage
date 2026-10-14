import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.test.ts'],
    setupFiles: ['e2e/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
