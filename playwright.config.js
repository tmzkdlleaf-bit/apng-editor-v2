import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/perf/**'],
  // 인코딩(APNG/WebP/GIF 굽기) 테스트는 정상적으로도 10~15초 걸린다. 여유를 둔다.
  timeout: 60000,
  // 과다 구독 방지: 인코딩 테스트는 페이지당 렌더 스레드 + 인코드 워커 스레드를 쓴다.
  // 8코어에서 기본 워커(4)면 최대 8스레드가 코어를 꽉 채워, 그 틈에 다른 테스트의
  // page.goto 가 CPU를 못 얻어 60초 타임아웃으로 간헐 실패했다(예: p2-patch beforeEach).
  // 워커를 3으로 낮춰 네비게이션·dev 서버가 쓸 코어 여유를 남긴다. CI(2코어)는 2.
  workers: process.env.CI ? 2 : 3,
  // CI는 남은 부하성 깜빡임을 1회 재시도로 흡수한다(일관된 실패는 그대로 잡힘). 로컬은 0.
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
