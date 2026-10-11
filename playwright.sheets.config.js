import { defineConfig } from '@playwright/test';

// 견본 시트 생성(npm run sheets) — docs/fx-sheets/ 에 효과·모션 시트 PNG 를 만든다.
// 일반 테스트(npm test)에서는 제외(testIgnore). 검수 자료 생성용.
export default defineConfig({
  testDir: './tests/sheets',
  timeout: 120000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
