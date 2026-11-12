// R32 — 사용 흐름 시험: 사람이 하듯 버튼을 누르고 캔버스를 끌어 본다.
//   (그림만 맞는지 보던 예전 시험이 놓친 불편 — 효과가 도형 안에 숨어 들어감, 효과를 옮길 수 없음 등)
import { test, expect } from './helpers/fixtures.js';

async function openApp(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  const collapsed = await page.locator('.panel-dock-left.is-collapsed').count();
  if (collapsed) await page.locator('.panel-dock-left .panel-collapse').click();
  await page.locator('.panel-dock-left .panel-tab', { hasText: '효과' }).click();
}

const sel = (page) => page.evaluate(() => {
  const id = window.__editorState.get().selection[0];
  const l = window.__store.get().layers[id];
  return l ? { id, type: l.type, effectId: l.effectId, scope: l.scope, box: l.box, x: l.transform.x.value, y: l.transform.y.value } : null;
});

test('효과 패널: 효과/모션 탭이 나뉘고, 자주 쓰는 묶음은 처음부터 펼쳐져 있다', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.side-mode-btn[data-mode="fx"]')).toHaveClass(/is-active/);
  await expect(page.locator('.fx-row[data-fx-id="sparkle"]')).toBeVisible();     // '빛' 펼침
  await expect(page.locator('.motion-row')).toHaveCount(0);                     // 효과 탭엔 모션 없음
  await page.locator('.side-mode-btn[data-mode="motion"]').click();
  await expect(page.locator('.motion-row').first()).toBeVisible();
  await expect(page.locator('.fx-row')).toHaveCount(0);
});

test('+ 버튼: 도형을 선택해 둬도 효과는 새 레이어(움직이는 상자)로 들어간다', async ({ page }) => {
  await openApp(page);
  await page.click('[data-action="add-layer"]');
  await page.locator('.shape-grid-item').first().click();
  const shapeId = (await sel(page)).id;
  await page.fill('.effects-search', '불꽃');
  const row = page.locator('.fx-row[data-fx-id="flame"]');
  await row.hover();
  await row.locator('.side-item-add').click();
  const s = await sel(page);
  expect(s.type).toBe('effect');
  expect(s.effectId).toBe('flame');
  expect(s.scope).toBe('box');
  expect(s.box.w).toBeGreaterThan(100);
  const inShape = await page.evaluate((i) => (window.__store.get().layers[i].fxOrder ?? []).length, shapeId);
  expect(inShape).toBe(0);
  // 효과를 고르면 오른쪽은 "효과 컨트롤" 탭
  await expect(page.locator('.panel-dock-right .panel-tab.is-on').first()).toHaveText(/효과 컨트롤/);
});

test('효과 상자를 캔버스에서 클릭해 고르고 끌어서 옮길 수 있다', async ({ page }) => {
  await openApp(page);
  await page.fill('.effects-search', '반짝임');
  await page.locator('.fx-row[data-fx-id="sparkle"]').dblclick();
  const a = await sel(page);
  // 선택을 풀고, 캔버스에서 효과 상자 가운데를 눌러 다시 고른 뒤 끈다.
  await page.evaluate(() => window.__editorState.set({ selection: [] }));
  const c = await page.evaluate(({ x, y }) => window.__stage.docToScreen ? window.__stage.docToScreen(x, y) : null, { x: a.x, y: a.y });
  const rect = await page.locator('.stage-overlay').boundingBox();
  const sx = rect.x + (c?.x ?? rect.width / 2), sy = rect.y + (c?.y ?? rect.height / 2);
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move(sx - 60, sy - 40, { steps: 8 }); await page.mouse.up();
  const b = await sel(page);
  expect(b?.id).toBe(a.id);
  expect(b.x).toBeLessThan(a.x - 20);
  expect(b.y).toBeLessThan(a.y - 10);
});

test('오른쪽 클릭 메뉴로만 선택한 레이어 안에 효과를 넣는다', async ({ page }) => {
  await openApp(page);
  await page.click('[data-action="add-layer"]');
  await page.locator('.shape-grid-item').first().click();
  const shapeId = (await sel(page)).id;
  await page.fill('.effects-search', '빛무리');
  await page.locator('.fx-row[data-fx-id="glow"]').click({ button: 'right' });
  await page.locator('.side-row-menu-item', { hasText: '안에 넣기' }).click();
  const n = await page.evaluate((i) => (window.__store.get().layers[i].fxOrder ?? []).length, shapeId);
  expect(n).toBe(1);
});

test('효과를 캔버스에 끌어 놓으면 놓은 자리가 상자 가운데가 된다', async ({ page }) => {
  await openApp(page);
  await page.fill('.effects-search', '반짝임');
  const rect = await page.locator('.stage-overlay').boundingBox();
  const sx = 200, sy = 160;
  const expected = await page.evaluate(({ sx, sy }) => window.__stage.screenToDoc(sx, sy), { sx, sy });
  await page.evaluate(({ x, y }) => {
    const src = document.querySelector('.fx-row[data-fx-id="sparkle"]');
    const dst = document.querySelector('.stage-overlay');
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    for (const t of ['dragenter', 'dragover', 'drop']) dst.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  }, { x: rect.x + sx, y: rect.y + sy });
  const s = await sel(page);
  expect(s.effectId).toBe('sparkle');
  expect(Math.abs(s.x - expected.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(s.y - expected.y)).toBeLessThanOrEqual(2);
});

test('실사 소재(내장)는 그룹 하나로 들어가고 화면에 그려진다', async ({ page }) => {
  await openApp(page);
  await page.click('[data-action="add-layer"]');
  await page.locator('.layer-add-item', { hasText: '불길' }).click();
  await page.waitForFunction(() => window.__store.get().order.length === 1, null, { timeout: 5000 });
  const r = await page.evaluate(() => {
    const d = window.__store.get();
    const g = d.layers[d.order[0]];
    return { type: g.type, name: g.name, kids: g.childOrder.map((id) => d.layers[id].type) };
  });
  expect(r.type).toBe('group');
  expect(r.name).toBe('실사 불길');
  expect(r.kids).toEqual(['image', 'effect']);
});
