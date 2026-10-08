// F3-7 — 조작 모드: 옮기기(V)·편집(E)·움직이기(P)·손(H).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(100);
}

test('F3-7 — E·P 키로 편집·움직이기 모드 전환', async ({ page }) => {
  await openApp(page);
  await page.locator('body').click();
  await page.keyboard.press('e');
  expect(await page.evaluate(() => window.__editorState.get().tool)).toBe('edit');
  await page.keyboard.press('p');
  expect(await page.evaluate(() => window.__editorState.get().tool)).toBe('motion');
  await page.keyboard.press('v');
  expect(await page.evaluate(() => window.__editorState.get().tool)).toBe('select');
});

test('F3-7 — 도구 버튼 4개(옮기기·편집·움직이기·손)', async ({ page }) => {
  await openApp(page);
  const tools = await page.locator('.stage-tools [data-tool]').evaluateAll((els) => els.map((e) => e.dataset.tool));
  expect(tools).toEqual(['select', 'edit', 'motion', 'hand']);
  // 편집 버튼 클릭 → tool edit + active
  await page.click('.stage-tools [data-tool="edit"]');
  expect(await page.evaluate(() => window.__editorState.get().tool)).toBe('edit');
  await expect(page.locator('.stage-tools [data-tool="edit"]')).toHaveClass(/active/);
});
