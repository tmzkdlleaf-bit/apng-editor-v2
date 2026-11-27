// R34a 화면 검수 — 화면 아래 줄의 "GPU 가속(시험)" 토글(라이트·다크). 파일 생성이 목적.
//   SCREENS_DOCS=1 이면 docs/screens/ 로, 아니면 test-results/screens/ 로.
import { test } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SCREENS_DOCS ? join(__dir, '..', 'docs', 'screens') : join(__dir, '..', 'test-results', 'screens');

test.use({ viewport: { width: 1400, height: 900 } });

for (const theme of ['dark', 'light']) {
  test(`R34a GPU 토글 화면 — ${theme}`, async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage), null, { timeout: 30000 });
    await page.evaluate((t) => { try { localStorage.setItem('apng2.theme', t); } catch {} document.documentElement.setAttribute('data-theme', t); }, theme);
    await page.waitForTimeout(150);

    const bar = page.locator('.stage-bottombar');
    // 켜기 전
    await bar.screenshot({ path: join(OUT, `${theme}-r34-gpu-off.png`) });

    // "GPU 가속(시험)" 체크박스를 켠다
    const label = page.locator('.bb-check', { hasText: 'GPU 가속(시험)' });
    if (await label.count()) {
      await label.locator('input[type=checkbox]').check();
      await page.waitForTimeout(200);
    }
    await bar.screenshot({ path: join(OUT, `${theme}-r34-gpu-on.png`) });
  });
}
