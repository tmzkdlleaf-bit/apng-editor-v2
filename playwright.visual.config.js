import { defineConfig } from '@playwright/test';

// R23d item 8 — 화면 사진 비교(toHaveScreenshot). npm test 와 분리한다:
//   기준 사진은 운영체제마다 글자 모양이 달라 OS별로 따로 생긴다(파일명에 -win32 / -linux 가 붙는다).
//   CI(리눅스)는 리눅스 기준 사진이 커밋돼 있어야 통과하므로, 기본 npm test 에서는 빼고
//   `npm run visual` 로만 돌린다. 리눅스 기준 사진은 .github/workflows/visual-baselines.yml(수동 실행)로 만든다.
//   일부러 화면을 바꾼 묶음에서는 `npx playwright test --config=playwright.visual.config.js --update-snapshots`.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/r23d-visual.spec.js',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,   // 처음엔 1% 부터(글자 안티앨리어싱 흔들림 흡수).
      animations: 'disabled',
      caret: 'hide',
    },
  },
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
