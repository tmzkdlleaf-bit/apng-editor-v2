// F1-10 — 여러 선택: 값이 다르면 '혼합' 표시, 입력하면 전부 적용·기록 1건.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('F1-10 — 보정: 서로 다른 밝기 두 이미지 선택 → 혼합 표시', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const doc = window.__store.get();
    const imgs = doc.order.filter((id) => doc.layers[id]?.type === 'image').slice(0, 2);
    // 서로 다른 밝기로 설정
    window.__store.apply({ type: 'setLayer', id: imgs[0], patch: { adjust: { brightness: 120 } } });
    window.__store.apply({ type: 'setLayer', id: imgs[1], patch: { adjust: { brightness: 80 } } });
    window.__editorState.set({ selection: imgs });
    return imgs;
  });
  await page.waitForTimeout(100);

  const sec = page.locator('.inspector-section', { hasText: '보정' });
  await sec.locator('.inspector-section-header').first().click(); // 펼치기
  // 밝기 숫자 칸이 '혼합'(placeholder) 상태
  const firstNum = sec.locator('.num-input').first();
  await expect(firstNum).toHaveValue('');
  const ph = await firstNum.getAttribute('placeholder');
  expect(ph).toContain('혼합');
});

test('F1-10 — 도형: 서로 다른 크기 두 도형 선택 → W 혼합, 입력하면 둘 다 적용·기록 1건', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const doc = window.__store.get();
    const shapes = doc.order.filter((id) => doc.layers[id]?.type === 'shape' && (doc.layers[id].shape?.w ?? 999) <= 120).slice(0, 2);
    window.__store.apply({ type: 'setLayer', id: shapes[0], patch: { shape: { ...doc.layers[shapes[0]].shape, w: 60 } } });
    window.__store.apply({ type: 'setLayer', id: shapes[1], patch: { shape: { ...doc.layers[shapes[1]].shape, w: 100 } } });
    window.__editorState.set({ selection: shapes });
    return shapes;
  });
  await page.waitForTimeout(100);

  const sec = page.locator('.inspector-section', { hasText: '도형' });
  // W 칸(첫 num-input)이 혼합
  const wInput = sec.locator('.num-input').first();
  await expect(wInput).toHaveValue('');
  expect(await wInput.getAttribute('placeholder')).toContain('혼합');

  // 입력 → 둘 다 적용(Enter), 기록 1건
  const depthBefore = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  await wInput.fill('150');
  await wInput.press('Enter');
  const ws = await page.evaluate((arr) => arr.map((id) => window.__store.get().layers[id].shape.w), ids);
  expect(ws).toEqual([150, 150]);

  // 되돌리기 1건 → 둘 다 원래
  await page.evaluate(() => window.__store.undo());
  const ws2 = await page.evaluate((arr) => arr.map((id) => window.__store.get().layers[id].shape.w), ids);
  expect(ws2).toEqual([60, 100]);
});
