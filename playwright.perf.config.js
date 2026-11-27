import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/perf',
  // r34-gpu-real 은 headed + 실제 GPU 전용(npm run perf:gpu:real). 무겁고(헤드리스=SwiftShader)
  // 바로 뒤 s5-perf 측정을 열간섭으로 흔든다 → 기본 perf 에서 뺀다.
  testIgnore: ['**/r34-gpu-real.spec.js'],
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
