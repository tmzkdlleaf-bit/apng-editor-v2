import { defineConfig } from '@playwright/test';

// 실제 GPU 로 재는 전용 설정 — 기본 headless 는 SwiftShader(소프트웨어)로 떨어지기 쉽다.
//   headed + ANGLE(d3d11) + GPU 켜기로 띄워 진짜 그래픽카드를 쓰게 한다.
//   측정값은 기기마다 다르므로 기준값 파일에 넣지 않는다. 실행: npm run perf:gpu:real
export default defineConfig({
  testDir: './tests/perf',
  testMatch: /r34-gpu-real\.spec\.js/,
  timeout: 120000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: false, // 실제 GPU 는 보통 headed 에서 잡힌다
    launchOptions: {
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
    },
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
