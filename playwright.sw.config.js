import { defineConfig } from '@playwright/test';
import { execSync } from 'node:child_process';

// R7-1 오프라인 설치(서비스 워커 업데이트) 테스트 — 빌드한 dist 를 서버로 띄워 검사한다.
// npm test(기본 설정)에서는 tests/sw/ 를 제외한다. 실행: npm run test:sw
// 서버가 뜨기 전에 dist 가 있어야 하므로 설정 로드 시점에 한 번 빌드한다.
execSync('npm run build', { stdio: 'inherit' });

export default defineConfig({
  testDir: './tests/sw',
  timeout: 120000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5176',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx http-server dist -p 5176 -c-1 --cors',
    url: 'http://localhost:5176',
    reuseExistingServer: false,
    timeout: 20000,
  },
});
