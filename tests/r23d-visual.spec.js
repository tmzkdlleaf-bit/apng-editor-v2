// R23d item 8 — 화면 사진 비교(toHaveScreenshot). 라이트·다크 × 1440×900·1280×720.
//   화면: 첫 화면(빈 프로젝트) · 이미지+빛무리 · 파일 메뉴 연 상태 · 새 장면 창 · 내보내기 창.
//   흔들림 막기: 애니메이션·커서는 config 에서 끔. 재생 위치 0 고정. 저장 상태처럼 바뀌는 곳은 mask.
//   기준 사진 갱신: npx playwright test --config=playwright.visual.config.js --update-snapshots
import { test, expect } from './helpers/fixtures.js';

const SIZES = [{ w: 1440, h: 900 }, { w: 1280, h: 720 }];

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    try { localStorage.setItem('apng2.theme', t); } catch {}
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(80);
}
async function settle(page) {
  // 재생 위치 0 고정 + 두 프레임 기다려 렌더 반영.
  await page.evaluate(() => window.__editorState.set({ f: 0, playing: false }));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(120);
}
// 바뀌는 곳(저장 상태 글자) 가리기.
function masks(page) { return [page.locator('#save-status')]; }

for (const theme of ['dark', 'light']) {
  for (const { w, h } of SIZES) {
    const tag = `${theme}-${w}`;
    test.describe(`사진 비교 ${tag}`, () => {
      test.use({ viewport: { width: w, height: h } });

      test(`빈 프로젝트·파일 메뉴·새 장면·내보내기 (${tag})`, async ({ page }) => {
        await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
        await page.goto('/');
        await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
        await setTheme(page, theme);
        await settle(page);

        // 01 첫 화면(빈 프로젝트)
        await expect(page).toHaveScreenshot(`empty-${tag}.png`, { mask: masks(page) });

        // 02 파일 메뉴 연 상태
        await page.locator('.menu-top', { hasText: '파일' }).click();
        await expect(page.locator('.menu-dropdown:visible')).toHaveCount(1);
        await expect(page).toHaveScreenshot(`file-menu-${tag}.png`, { mask: masks(page) });
        await page.keyboard.press('Escape');

        // 03 새 장면 창
        await page.locator('.menu-top', { hasText: '파일' }).click();
        await page.locator('.menu-item', { hasText: '새 장면' }).click();
        await expect(page.locator('.newscene-modal')).toBeVisible();
        await page.waitForTimeout(120);
        await expect(page).toHaveScreenshot(`newscene-${tag}.png`, { mask: masks(page) });
        await page.keyboard.press('Escape');

        // 04 내보내기 창(미리보기 나온 뒤)
        await page.keyboard.press('Control+e');
        await expect(page.locator('.export-modal')).toBeVisible();
        await page.waitForFunction(() => {
          const img = document.querySelector('.export-modal img');
          return img && img.getAttribute('src') && img.getAttribute('src').startsWith('blob:');
        }, null, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(200);
        // 미리보기 이미지는 인코더에 따라 미세하게 달라질 수 있어 가린다.
        await expect(page).toHaveScreenshot(`export-${tag}.png`, { mask: [...masks(page), page.locator('.export-modal img')] });
        await page.keyboard.press('Escape');
      });

      test(`이미지+빛무리 (${tag})`, async ({ page }) => {
        await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
        await page.goto('/?demo=1');
        await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
        await setTheme(page, theme);
        // 데모의 이미지 레이어에 빛무리 효과를 쌓고 선택.
        await page.evaluate(() => {
          const doc = window.__store.get();
          const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
          if (id) { window.__store.apply({ type: 'addFx', id, effectId: 'glow' }); window.__editorState.set({ selection: [id] }); }
        });
        await settle(page);
        await expect(page).toHaveScreenshot(`image-glow-${tag}.png`, { mask: masks(page) });
      });
    });
  }
}
