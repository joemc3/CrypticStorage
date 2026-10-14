import { defineConfig, devices } from '@playwright/test';

/**
 * A browser smoke for the design: every route, desktop and phone, light and dark.
 * No API is needed; the spec mocks every request the screens make.
 * Screenshots land in e2e-browser/screenshots for the owner to review against the artboards.
 */
const sizes = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
} as const;
const schemes = ['light', 'dark'] as const;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'off',
  },
  webServer: {
    command: 'npx vite --port 3100 --strictPort',
    cwd: '..',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: Object.entries(sizes).flatMap(([size, viewport]) =>
    schemes.map((colorScheme) => ({
      name: `${size}-${colorScheme}`,
      metadata: { size, width: viewport.width, scheme: colorScheme },
      use: { ...devices['Desktop Chrome'], viewport, colorScheme, deviceScaleFactor: 1 },
    }))
  ),
});
