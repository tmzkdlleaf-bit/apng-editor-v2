// R23c 3부 — 새 장면 창(템플릿 갤러리 대체).
import { test, expect } from '@playwright/test';

async function openReal(page) {
  await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__project));
  await page.waitForTimeout(120);
  // 새 장면은 projectApi.newScene 을 부르고 새로고침한다. 테스트에선 인자만 가로채고 새로고침을 막는다.
  await page.evaluate(() => {
    window.__noReload = true; window.__newSceneArgs = null;
    const api = window.__project;
    api.newScene = (a) => { window.__newSceneArgs = a; return Promise.resolve(); };
  });
}

async function openDialog(page) {
  await page.locator('.menu-top', { hasText: '파일' }).click();
  await page.locator('.menu-item', { hasText: '새 장면' }).click();
  await expect(page.locator('.newscene-modal')).toBeVisible();
}

test('프리셋 고르기 → 가로·세로 반영', async ({ page }) => {
  await openReal(page);
  await openDialog(page);
  // 크기 프리셋 드롭다운 열어 "배경 (1280×720)" 고르기.
  const presetDd = page.locator('.newscene-row', { hasText: '크기 프리셋' }).locator('.dropdown');
  await presetDd.click();
  await page.locator('.dropdown-option', { hasText: '배경' }).click();
  const nums = page.locator('.newscene-size .newscene-num');
  await expect(nums.nth(0)).toHaveValue('1280');
  await expect(nums.nth(1)).toHaveValue('720');
});

test('초 입력 → 프레임 자동 계산', async ({ page }) => {
  await openReal(page);
  await openDialog(page);
  // fps 12 기본. 길이 칸의 초 입력(두 번째 num) = 3 → 프레임 36.
  const lenNums = page.locator('.newscene-len .newscene-num');
  const secInput = lenNums.nth(1);
  await secInput.fill('3');
  await secInput.press('Enter');
  await expect(lenNums.nth(0)).toHaveValue('36');
});

test('만들기 → 크기·fps·길이가 newScene 으로 전달', async ({ page }) => {
  await openReal(page);
  await openDialog(page);
  const sizeNums = page.locator('.newscene-size .newscene-num');
  await sizeNums.nth(0).fill('640'); await sizeNums.nth(0).blur();
  await sizeNums.nth(1).fill('480'); await sizeNums.nth(1).blur();
  const lenNums = page.locator('.newscene-len .newscene-num');
  await lenNums.nth(0).fill('48'); await lenNums.nth(0).blur();
  await page.locator('.newscene-btns .accent', { hasText: '만들기' }).click();
  const args = await page.evaluate(() => window.__newSceneArgs);
  expect(args.width).toBe(640);
  expect(args.height).toBe(480);
  expect(args.fps).toBe(12);
  expect(args.frameCount).toBe(48);
});
