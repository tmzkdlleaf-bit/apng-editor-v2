// R21b — 가리기 화면 도구(사각형/타원 끌기·펜·점 편집)·좌표 변환·모양 키.
import { test, expect } from '@playwright/test';

async function addShape(page, { w = 200, h = 200, x = 384, y = 384 } = {}) {
  return page.evaluate(async (args) => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '가리기대상' });
    l.shape = { kind: 'rect', w: args.w, h: args.h, fill: '#88ccff', stroke: null };
    l.transform.x = { value: args.x }; l.transform.y = { value: args.y };
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  }, { w, h, x, y });
}

// 가리기 점(레이어 좌표) → 화면 client 좌표(마우스용)
async function maskToClient(page, id, pt) {
  return page.evaluate(async (args) => {
    const { maskPtToScreen } = await import('/src/ui/canvas/mask-space.js');
    const cv = document.querySelector('.stage-overlay');
    const r = cv.getBoundingClientRect();
    const es = window.__editorState.get();
    const doc = window.__store.get();
    const s = maskPtToScreen(args.pt, doc.layers[args.id], doc, es.f, { zoom: es.zoom, panX: es.panX, panY: es.panY, W: r.width, H: r.height }, window.__stage?.assets ?? null);
    return { x: r.left + s.x, y: r.top + s.y };
  }, { id, pt });
}

test('좌표 왕복: screenToMaskPt(maskPtToScreen(pt)) ≈ pt', async ({ page }) => {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { maskPtToScreen, screenToMaskPt } = await import('/src/ui/canvas/mask-space.js');
    const doc = createDoc();
    const l = createLayer('shape'); l.shape = { kind: 'rect', w: 200, h: 120, fill: '#fff', stroke: null };
    l.transform.x = { value: 300 }; l.transform.y = { value: 250 }; l.transform.rotation = { value: 25 };
    doc.layers[l.id] = l; doc.order.push(l.id);
    const view = { zoom: 1.4, panX: 20, panY: -10, W: 800, H: 600 };
    for (const pt of [{ x: 0, y: 0 }, { x: 200, y: 120 }, { x: 70, y: 40 }]) {
      const s = maskPtToScreen(pt, l, doc, 0, view, null);
      const back = screenToMaskPt(s.x, s.y, l, doc, 0, view, null);
      if (Math.hypot(back.x - pt.x, back.y - pt.y) > 0.01) return `fail ${pt.x},${pt.y}`;
    }
    return 'ok';
  });
  expect(ok).toBe('ok');
});

test('사각형 도구: 끌어서 가리기 생성, 되돌리기 1건', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  const id = await addShape(page);
  await page.evaluate(() => window.__editorState.set({ tool: 'maskRect' }));
  const p1 = await maskToClient(page, id, { x: 40, y: 40 });
  const p2 = await maskToClient(page, id, { x: 160, y: 160 });
  const d0 = await page.evaluate(() => window.__store.undoDepth());
  await page.mouse.move(p1.x, p1.y); await page.mouse.down();
  await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); await page.mouse.move(p2.x, p2.y);
  await page.mouse.up();
  const r = await page.evaluate((i) => {
    const l = window.__store.get().layers[i];
    return { count: l.masks?.order?.length ?? 0, pts: l.masks ? l.masks.items[l.masks.order[0]].path.value.pts.length : 0, d1: window.__store.undoDepth() };
  }, id);
  expect(r.count).toBe(1);
  expect(r.pts).toBe(4);
  expect(r.d1).toBe(d0 + 1);
});

test('펜 도구: 점 3개 + 닫기 → 닫힌 가리기, 되돌리기 1번에 사라짐', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  const id = await addShape(page);
  await page.evaluate(() => window.__editorState.set({ tool: 'pen' }));
  const pts = [{ x: 50, y: 50 }, { x: 150, y: 60 }, { x: 120, y: 150 }];
  const cs = [];
  for (const p of pts) cs.push(await maskToClient(page, id, p));
  const d0 = await page.evaluate(() => window.__store.undoDepth());
  for (const c of cs) { await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.up(); }
  // 첫 점 근처 클릭 → 닫기
  await page.mouse.move(cs[0].x, cs[0].y); await page.mouse.down(); await page.mouse.up();
  const r = await page.evaluate((i) => {
    const l = window.__store.get().layers[i];
    const m = l.masks ? l.masks.items[l.masks.order[0]] : null;
    return { count: l.masks?.order?.length ?? 0, pts: m ? m.path.value.pts.length : 0, closed: m ? m.path.value.closed : null, d1: window.__store.undoDepth() };
  }, id);
  expect(r.count).toBe(1);
  expect(r.pts).toBe(3);
  expect(r.closed).toBe(true);
  expect(r.d1).toBe(d0 + 1);
  await page.evaluate(() => window.__store.undo());
  const gone = await page.evaluate((i) => (window.__store.get().layers[i].masks?.order?.length ?? 0) === 0, id);
  expect(gone).toBe(true);
});

test('편집 도구: 점 끌기로 모양 바뀜(되돌리기 1건)', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  const id = await addShape(page);
  // 가리기 미리 생성(사각형)
  const mid = await page.evaluate((i) => {
    const { createMask, rectMaskPts } = window.__schema ?? {};
    return import('/src/core/doc/schema.js').then((S) => {
      const m = S.createMask({ name: '가리기 1', path: { value: S.rectMaskPts(40, 40, 120, 120) } });
      window.__store.apply({ type: 'addMask', id: i, mask: m });
      window.__editorState.set({ tool: 'edit' });
      return m.id;
    });
  }, id);
  const before = await page.evaluate((args) => window.__store.get().layers[args.id].masks.items[args.mid].path.value.pts[0].x, { id, mid });
  const from = await maskToClient(page, id, { x: 40, y: 40 });   // 첫 점
  const d0 = await page.evaluate(() => window.__store.undoDepth());
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x - 30, from.y - 20); await page.mouse.move(from.x - 60, from.y - 40);
  await page.mouse.up();
  const r = await page.evaluate((args) => {
    const p0 = window.__store.get().layers[args.id].masks.items[args.mid].path.value.pts[0];
    return { x: p0.x, d1: window.__store.undoDepth() };
  }, { id, mid });
  expect(Math.abs(r.x - before)).toBeGreaterThan(5); // 점이 이동
  expect(r.d1).toBe(d0 + 1);
});

test('모양 키 있으면 편집 시 현재 프레임에 키가 들어간다', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  const id = await addShape(page);
  const mid = await page.evaluate(async (i) => {
    const S = await import('/src/core/doc/schema.js');
    const base = S.rectMaskPts(40, 40, 120, 120);
    const m = S.createMask({ name: '가리기 1' });
    m.path = { value: base, keys: [{ f: 0, v: base, ease: 'linear' }, { f: 10, v: base, ease: 'linear' }] };
    window.__store.apply({ type: 'addMask', id: i, mask: m });
    window.__editorState.set({ tool: 'edit', f: 5 });
    return m.id;
  }, id);
  const from = await maskToClient(page, id, { x: 40, y: 40 });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x - 40, from.y - 30); await page.mouse.up();
  const r = await page.evaluate((args) => {
    const keys = window.__store.get().layers[args.id].masks.items[args.mid].path.keys;
    return { keyFrames: keys.map((k) => k.f) };
  }, { id, mid });
  expect(r.keyFrames).toContain(5); // 프레임 5에 모양 키 생성
});
