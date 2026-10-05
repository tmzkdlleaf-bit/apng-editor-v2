import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/perf',
  timeout: 60000,
  retries: 0,
  // 성능 측정은 반드시 직렬로 — 병렬 워커가 CPU를 두고 경쟁하면 측정값이 요동친다.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
