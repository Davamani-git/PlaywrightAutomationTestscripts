import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests',
  outputDir: './test-results',
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  projects: [
    {
      name: 'Chromium',
      use: { ...devices['Desktop Chrome'], trace: 'on-first-retry' }
    },
    {
      name: 'Firefox',
      use: { ...devices['Desktop Firefox'], trace: 'on-first-retry' }
    },
    {
      name: 'WebKit',
      use: { ...devices['Desktop Safari'], trace: 'on-first-retry' }
    }
  ],
  fullyParallel: true,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
