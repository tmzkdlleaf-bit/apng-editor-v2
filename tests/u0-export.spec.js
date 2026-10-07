// U0-7 — 내보내기 창: 결과 전 placeholder, 형식 세그먼트 버튼.
import { test, expect } from '@playwright/test';

async function openModal(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__exportUI));
  await page.keyboard.press('Control+e');
  await expect(page.locator('.export-modal')).toBeVisible();
}

test('U0-7 — 결과 전 미리보기 placeholder("만드는 중…"), 결과 후 이미지', async ({ page }) => {
  await openModal(page);
  // 결과 전: placeholder 보이고 img 숨김
  await expect(page.locator('#ex-preview-empty')).toBeVisible();
  await expect(page.locator('.ex-preview-msg')).toContainText('만드는 중');
  await expect(page.locator('.ex-preview')).toBeHidden();
  // 예상 결과가 나오면 img 보이고 placeholder 숨김
  await page.waitForFunction(() => !!window.__exportUI.getLastResult(), null, { timeout: 20000 });
  await expect(page.locator('.ex-preview')).toBeVisible();
  await expect(page.locator('#ex-preview-empty')).toBeHidden();
});

test('U0-7 — 형식 세그먼트 버튼: 선택 반영 + is-on', async ({ page }) => {
  await openModal(page);
  await page.click('.ex-settings .ex-seg-btn[data-format="webp"]');
  expect(await page.evaluate(() => window.__exportUI.getState().format)).toBe('webp');
  await expect(page.locator('.ex-seg-btn[data-format="webp"]')).toHaveClass(/is-on/);
  // 네이티브 라디오가 아니다(세그먼트 버튼)
  expect(await page.locator('.ex-settings input[name="ex-format"]').count()).toBe(0);
});
