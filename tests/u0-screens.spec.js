// U0 — 다크·라이트 주요 화면 스크린샷을 docs/screens/ 에 저장(검수용). 단언 최소, 파일 생성이 목적.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'docs', 'screens');

test.use({ viewport: { width: 1400, height: 900 } });

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    try { localStorage.setItem('apng2.theme', t); } catch {}
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(80);
}

for (const theme of ['dark', 'light']) {
  test(`U0 스크린샷 — ${theme}`, async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage && window.__exportUI), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await setTheme(page, theme);

    // 1) 빈 선택 — 인스펙터 안내
    await page.evaluate(() => window.__editorState.set({ selection: [] }));
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(OUT, `${theme}-01-empty.png`) });

    // 2) 레이어 선택 — 인스펙터 섹션
    await page.evaluate(() => {
      const ids = window.__store.get().order;
      if (ids.length) window.__editorState.set({ selection: [ids[0]] });
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, `${theme}-02-layer.png`) });

    // 3) 블렌드 드롭다운 열림(인스펙터 모습 섹션)
    const blend = page.locator('.inspector-section .dropdown').first();
    if (await blend.count()) {
      await blend.scrollIntoViewIfNeeded();
      await blend.click();
      await page.waitForTimeout(120);
      await page.screenshot({ path: join(OUT, `${theme}-03-dropdown.png`) });
      await page.keyboard.press('Escape');
    }

    // 4) 레이어 추가 메뉴 열림
    await page.click('.tl-layers-head .tl-add-btn');
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(OUT, `${theme}-04-addmenu.png`) });
    await page.keyboard.press('Escape');
    await page.mouse.click(700, 450);

    // 5) 내보내기 창
    await page.keyboard.press('Control+e');
    await expect(page.locator('.export-modal')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `${theme}-05-export.png`) });
    await page.keyboard.press('Escape');
  });
}
