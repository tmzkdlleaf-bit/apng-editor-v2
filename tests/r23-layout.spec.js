// R23 — 전문가 화면 틀. 1단계: 도킹 패널 프레임(경계 끌기·접기·탭 + localStorage 저장).
import { test, expect } from '@playwright/test';

test('오른쪽 패널이 보이고 경계 끌기로 폭이 바뀌며 새로고침 후 유지된다', async ({ page }) => {
  await page.goto('/');
  const dock = page.locator('.panel-dock-right');
  await expect(dock).toBeVisible();
  await expect(page.locator('[data-region="inspector"]')).toBeVisible();

  const w0 = (await dock.boundingBox()).width;
  const sp = page.locator('.panel-splitter-right');
  const box = await sp.boundingBox();
  const cy = box.y + box.height / 2;
  // 오른쪽 패널은 왼쪽으로 끌면 넓어진다.
  await page.mouse.move(box.x + box.width / 2, cy);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, cy, { steps: 6 });
  await page.mouse.up();

  const w1 = (await dock.boundingBox()).width;
  expect(w1).toBeGreaterThan(w0 + 40);

  const stored = await page.evaluate(() => localStorage.getItem('apng2.ws.right'));
  expect(stored).toBeTruthy();

  await page.reload();
  await expect(page.locator('.panel-dock-right')).toBeVisible();
  const w2 = (await page.locator('.panel-dock-right').boundingBox()).width;
  expect(Math.abs(w2 - w1)).toBeLessThanOrEqual(4);
});

test('접기 버튼으로 패널이 접히고 펼쳐진다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-region="inspector"]')).toBeVisible();
  const collapse = page.locator('.panel-dock-right .panel-collapse');
  await collapse.click();
  await expect(page.locator('.panel-dock-right.is-collapsed')).toHaveCount(1);
  expect(await page.locator('[data-region="inspector"]').isVisible()).toBe(false);
  await collapse.click();
  await expect(page.locator('[data-region="inspector"]')).toBeVisible();
});

test('localStorage 가 막힌 환경에서도 기본 배치로 뜬다', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem() { throw new Error('blocked'); },
          setItem() { throw new Error('blocked'); },
          removeItem() { throw new Error('blocked'); },
          clear() {}, key() { return null; }, length: 0,
        },
      });
    } catch {}
  });
  await page.goto('/');
  const dock = page.locator('.panel-dock-right');
  await expect(dock).toBeVisible();
  await expect(page.locator('[data-region="inspector"]')).toBeVisible();
  const w = (await dock.boundingBox()).width;
  expect(Math.abs(w - 320)).toBeLessThanOrEqual(4); // 기본 폭
});
