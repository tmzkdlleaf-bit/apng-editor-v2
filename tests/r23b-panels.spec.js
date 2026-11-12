// R23b — 전문가 화면 1부: 왼쪽/오른쪽 패널(프로젝트·효과 / 효과 컨트롤·속성·정보).
import { test, expect } from './helpers/fixtures.js';
import { expectOnTop } from './helpers/on-top.js';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
  // R23c: 1280px 이하 첫 실행이면 왼쪽 패널이 접힌 채로 뜬다(기본 뷰포트 1280×720). 펼친다.
  const collapsed = await page.locator('.panel-dock-left.is-collapsed').count();
  if (collapsed) await page.locator('.panel-dock-left .panel-collapse').click();
}

async function addShape(page, x = 120, y = 100) {
  return page.evaluate(async ({ x, y }) => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '네모' });
    l.shape = { kind: 'rect', w: 80, h: 60, fill: '#ff8800', stroke: null };
    l.transform.x.value = x; l.transform.y.value = y;
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  }, { x, y });
}

// 합성 HTML5 끌어 놓기 — source 에서 dragstart(여기서 dataTransfer 채움) → target 에 dragover·drop.
async function dnd(page, sourceSel, { targetSel = null, clientX = 0, clientY = 0 } = {}) {
  return page.evaluate(({ sourceSel, targetSel, clientX, clientY }) => {
    const src = document.querySelector(sourceSel);
    const tgt = targetSel ? document.querySelector(targetSel) : document.elementFromPoint(clientX, clientY);
    if (!src || !tgt) return false;
    const dt = new DataTransfer();
    const fire = (el, type, cx, cy) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy }));
    const sr = src.getBoundingClientRect();
    fire(src, 'dragstart', sr.left + 5, sr.top + 5);
    fire(tgt, 'dragenter', clientX, clientY);
    fire(tgt, 'dragover', clientX, clientY);
    fire(tgt, 'drop', clientX, clientY);
    fire(src, 'dragend', clientX, clientY);
    return true;
  }, { sourceSel, targetSel, clientX, clientY });
}

test('패널 5개(프로젝트·효과 / 효과 컨트롤·속성·정보)가 보인다', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.panel-dock-left .panel-tab', { hasText: '프로젝트' })).toBeVisible();
  await expect(page.locator('.panel-dock-left .panel-tab', { hasText: '효과' })).toBeVisible();
  await expect(page.locator('.panel-dock-right .panel-tab', { hasText: '효과 컨트롤' })).toBeVisible();
  await expect(page.locator('.panel-dock-right .panel-tab', { hasText: '속성' })).toBeVisible();
  await expect(page.locator('.panel-dock-right .panel-tab', { hasText: '정보' })).toBeVisible();
  // 기본 활성 탭은 속성.
  await expect(page.locator('[data-region="inspector"]')).toBeVisible();
});

test('왼쪽 패널: 경계 끌기로 폭이 바뀌고, 접기, 새로고침 후 유지', async ({ page }) => {
  await openApp(page);
  const dock = page.locator('.panel-dock-left');
  const w0 = (await dock.boundingBox()).width;
  const sp = page.locator('.panel-splitter-left');
  const box = await sp.boundingBox();
  const cy = box.y + box.height / 2;
  // 손잡이는 패널 바깥쪽이 overflow:hidden 으로 잘리므로 안쪽(box.x+1)을 잡는다.
  await page.mouse.move(box.x + 1, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, cy, { steps: 6 }); // 왼쪽 패널은 오른쪽으로 끌면 넓어진다
  await page.mouse.up();
  const w1 = (await dock.boundingBox()).width;
  expect(w1).toBeGreaterThan(w0 + 40);

  await page.reload();
  await page.waitForFunction(() => !!(window.__store));
  const w2 = (await page.locator('.panel-dock-left').boundingBox()).width;
  expect(Math.abs(w2 - w1)).toBeLessThanOrEqual(4);

  const collapse = page.locator('.panel-dock-left .panel-collapse');
  await collapse.click();
  await expect(page.locator('.panel-dock-left.is-collapsed')).toHaveCount(1);
});

test('효과 탭: "빛무리" 검색 → 이미지 레이어 줄에 끌어 놓으면 그 바로 위에 새 효과 레이어(R32), 되돌리기 1번에 원복', async ({ page }) => {
  await openApp(page);
  // 이미지 레이어(에셋 메타만) 하나.
  const id = await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    window.__store.apply({ type: 'addAsset', id: 'ast_t1', asset: { name: '그림', type: 'image/png', width: 64, height: 64 } });
    const l = createLayer('image', { name: '그림', assetId: 'ast_t1' });
    l.transform.x.value = 120; l.transform.y.value = 100;
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  });
  await page.locator('.panel-dock-left .panel-tab', { hasText: '효과' }).click();
  await page.fill('.effects-search', '빛무리');
  await expect(page.locator('.fx-row[data-fx-id="glow"]')).toHaveCount(1);

  const d0 = await page.evaluate(() => window.__store.undoDepth());
  await dnd(page, '.fx-row[data-fx-id="glow"]', { targetSel: `.tl-row[data-id="${id}"]` });
  await page.waitForTimeout(60);
  const r1 = await page.evaluate((i) => {
    const d = window.__store.get();
    const k = d.order.indexOf(i);
    return { inLayer: (d.layers[i].fxOrder ?? []).length, above: d.layers[d.order[k + 1]]?.effectId, len: d.order.length };
  }, id);
  expect(r1.inLayer).toBe(0);
  expect(r1.above).toBe('glow');   // 그 레이어 바로 위
  const d1 = await page.evaluate(() => window.__store.undoDepth());
  expect(d1 - d0).toBe(1);

  await page.evaluate(() => window.__store.undo());
  const n0 = await page.evaluate(() => window.__store.get().order.length);
  expect(n0).toBe(r1.len - 1);
});

test('에셋 우클릭 메뉴가 맨 위에 보인다(가려짐·잘림 없음)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__store.apply({ type: 'addAsset', id: 'ast_ctx', asset: { name: '포토', type: 'image/png', width: 50, height: 50 } }));
  const row = page.locator('.asset-row[data-asset-id="ast_ctx"]');
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  const menu = page.locator('.asset-menu');
  await expect(menu).toBeVisible();
  await expectOnTop(page, menu);
});

test('효과를 빈 곳(화면 모서리)에 놓으면 효과 레이어가 생긴다; 더블클릭도 늘 새 효과 레이어(R32)', async ({ page }) => {
  await openApp(page);
  await page.locator('.panel-dock-left .panel-tab', { hasText: '효과' }).click();
  await page.fill('.effects-search', '빛무리');
  await expect(page.locator('.fx-row[data-fx-id="glow"]')).toHaveCount(1);

  // 빈 곳(캔버스 왼쪽 위 모서리 = 문서 밖) → 효과 레이어 생성. 축소해 모서리를 확실히 배경으로.
  await page.evaluate(() => window.__editorState.set({ zoom: 0.2, panX: 0, panY: 0, selection: [] }));
  const rect = await page.locator('.stage-overlay').boundingBox();
  const before = await page.evaluate(() => window.__store.get().order.length);
  await dnd(page, '.fx-row[data-fx-id="glow"]', { targetSel: '.stage-overlay', clientX: rect.x + 3, clientY: rect.y + 3 });
  await page.waitForTimeout(60);
  const created = await page.evaluate(() => {
    const id = window.__editorState.get().selection[0];
    const l = window.__store.get().layers[id];
    return { type: l?.type, effectId: l?.effectId, grew: window.__store.get().order.length };
  });
  expect(created.type).toBe('effect');
  expect(created.effectId).toBe('glow');
  expect(created.grew).toBe(before + 1);

  // R32: 도형을 선택한 채 더블클릭해도 도형 안에 들어가지 않고 새 효과 레이어가 생긴다.
  const sid = await addShape(page);
  await page.locator('.fx-row[data-fx-id="glow"]').dblclick();
  await page.waitForTimeout(60);
  const r2 = await page.evaluate((i) => ({ inShape: (window.__store.get().layers[i].fxOrder ?? []).length, sel: window.__store.get().layers[window.__editorState.get().selection[0]]?.type }), sid);
  expect(r2.inShape).toBe(0);
  expect(r2.sel).toBe('effect');
});

test('프로젝트 탭: 에셋을 화면에 끌어 놓으면 이미지 레이어가 놓은 자리(문서 좌표 ±1)에 생긴다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__store.apply({ type: 'addAsset', id: 'ast_p1', asset: { name: '포토', type: 'image/png', width: 50, height: 50 } }));
  await page.locator('.panel-dock-left .panel-tab', { hasText: '프로젝트' }).click();
  await expect(page.locator('.asset-row[data-asset-id="ast_p1"]')).toBeVisible();

  const rect = await page.locator('.stage-overlay').boundingBox();
  const sx = 140, sy = 110;
  const cx = rect.x + sx, cy = rect.y + sy;
  const expected = await page.evaluate(({ sx, sy }) => window.__stage.screenToDoc(sx, sy), { sx, sy });
  await dnd(page, '.asset-row[data-asset-id="ast_p1"]', { targetSel: '.stage-overlay', clientX: cx, clientY: cy });
  await page.waitForTimeout(60);
  const pos = await page.evaluate(() => {
    const id = window.__editorState.get().selection[0];
    const l = window.__store.get().layers[id];
    return { type: l?.type, x: l?.transform.x.value, y: l?.transform.y.value };
  });
  expect(pos.type).toBe('image');
  expect(Math.abs(pos.x - Math.round(expected.x))).toBeLessThanOrEqual(1);
  expect(Math.abs(pos.y - Math.round(expected.y))).toBeLessThanOrEqual(1);
});

test('정보 탭: 마우스 좌표가 문서 좌표와 같다(줌 2배 + 이동 + 카메라 섞여도)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.__editorState.set({ zoom: 2, panX: 40, panY: -30, cameraActive: true });
    window.__store.apply({ type: 'setCameraProp', prop: 'x', value: 20, f: 0 });
  });
  await page.locator('.panel-dock-right .panel-tab', { hasText: '정보' }).click();
  await page.waitForTimeout(60);

  const rect = await page.locator('.stage-overlay').boundingBox();
  const sx = 160, sy = 120;
  await page.mouse.move(rect.x + sx, rect.y + sy);
  await page.waitForTimeout(100);
  const expected = await page.evaluate(({ sx, sy }) => window.__stage.screenToDoc(sx, sy), { sx, sy });
  const shown = await page.evaluate(() => ({
    x: parseInt(document.querySelector('.info-mx').textContent, 10),
    y: parseInt(document.querySelector('.info-my').textContent, 10),
  }));
  expect(Math.abs(shown.x - Math.round(expected.x))).toBeLessThanOrEqual(1);
  expect(Math.abs(shown.y - Math.round(expected.y))).toBeLessThanOrEqual(1);
});

test('효과 컨트롤 탭에 효과 쌓기가 보이고, 속성 탭에는 없다', async ({ page }) => {
  await openApp(page);
  await addShape(page);
  // 효과 컨트롤 탭 → 효과 쌓기 목록 보임
  await page.locator('.panel-dock-right .panel-tab', { hasText: '효과 컨트롤' }).click();
  await page.waitForTimeout(60);
  await expect(page.locator('[data-region="fx-control"] .fx-stack-list')).toBeVisible();
  // 속성 탭에는 효과 쌓기 요소가 아예 없다
  await page.locator('.panel-dock-right .panel-tab', { hasText: '속성' }).click();
  await expect(page.locator('[data-region="inspector"] .fx-stack-list')).toHaveCount(0);
});
