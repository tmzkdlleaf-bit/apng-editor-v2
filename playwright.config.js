import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/perf/**'],
  // 인코딩(APNG/WebP/GIF 굽기) 테스트는 정상적으로도 10~15초 걸린다. 병렬 실행 중
  // 머신 부하가 몰리면 페이지 셋업·실행이 30초를 넘겨 간헐 실패했다. 여유를 둔다.
  timeout: 60000,
  // CI는 부하성 깜빡임을 1회 재시도로 흡수한다(일관된 실패는 그대로 잡힘). 로컬은 0.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
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
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
