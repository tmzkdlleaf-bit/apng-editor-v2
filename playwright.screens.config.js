import { defineConfig } from '@playwright/test';

// 문서용 화면 검수 스크린샷 갱신(npm run screens) — docs/screens/ 를 덮어쓴다.
// 일반 테스트(npm test)는 test-results/screens/ 에만 찍고 docs/ 는 건드리지 않는다.
// 이 설정일 때만 SCREENS_DOCS 를 켜서 u0-screens 스펙이 docs/screens/ 로 내보낸다.
// (config 모듈은 워커 fork 전에 로드되므로 env 가 워커로 상속된다.)
process.env.SCREENS_DOCS = '1';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/u0-screens.spec.js',
  timeout: 60000,
  retries: 0,
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
