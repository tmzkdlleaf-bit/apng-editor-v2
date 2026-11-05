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

test('F3-7 — 도구 막대(R23c): 선택·손·확대·편집·가리기3·글자·도형·움직이기', async ({ page }) => {
  await openApp(page);
  // R23c: 도구 버튼은 캔버스 위가 아니라 메뉴 막대 아래 도구 막대(.toolbar)로 옮겼다.
  const tools = await page.locator('.toolbar [data-tool]').evaluateAll((els) => els.map((e) => e.dataset.tool));
  expect(tools).toEqual(['select', 'hand', 'zoom', 'edit', 'maskRect', 'maskEllipse', 'pen', 'text', 'shape', 'motion']);
  // 편집 버튼 클릭 → tool edit + active
  await page.click('.toolbar [data-tool="edit"]');
  expect(await page.evaluate(() => window.__editorState.get().tool)).toBe('edit');
  await expect(page.locator('.toolbar [data-tool="edit"]')).toHaveClass(/active/);
});

test('R23c — 확대 도구: 캔버스 클릭하면 줌이 커진다(Alt=작아짐)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__editorState.set({ tool: 'zoom', zoom: 1, panX: 0, panY: 0 }));
  const box = await page.locator('.stage-overlay').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  const z1 = await page.evaluate(() => window.__editorState.get().zoom);
  expect(z1).toBeGreaterThan(1);
  // Alt+클릭 → 축소
  await page.keyboard.down('Alt');
  await page.mouse.click(cx, cy);
  await page.keyboard.up('Alt');
  const z2 = await page.evaluate(() => window.__editorState.get().zoom);
  expect(z2).toBeLessThan(z1);
});

test('R23c — 글자/도형 도구: 누른 자리에 레이어가 생긴다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__editorState.set({ tool: 'text', zoom: 1, panX: 0, panY: 0 }));
  const box = await page.locator('.stage-overlay').boundingBox();
  const sx = 150, sy = 120;
  const expected = await page.evaluate(({ sx, sy }) => window.__stage.screenToDoc(sx, sy), { sx, sy });
  await page.mouse.click(box.x + sx, box.y + sy);
  const r = await page.evaluate(() => {
    const id = window.__editorState.get().selection[0];
    const l = window.__store.get().layers[id];
    return { type: l?.type, x: l?.transform.x.value, y: l?.transform.y.value, tool: window.__editorState.get().tool };
  });
  expect(r.type).toBe('text');
  expect(Math.abs(r.x - Math.round(expected.x))).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y - Math.round(expected.y))).toBeLessThanOrEqual(1);
  expect(r.tool).toBe('select'); // 만든 뒤 옮기기 도구로 복귀
});
