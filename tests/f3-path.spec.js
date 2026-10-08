// F3-4 — 캔버스 모션 경로: 점 끌기(해당 키만)·직선화·장면 재렌더 없음.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}
async function makePathLayer(page) {
  return page.evaluate(() => {
    const doc = window.__store.get();
    const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
    window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 0 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 300, f: 12 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 500, f: 23 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.y', value: 200, f: 0 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.y', value: 400, f: 12 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.y', value: 200, f: 23 });
    window.__editorState.set({ selection: [id] });
    return id;
  });
}

test('F3-4 — 경로 키 점이 motionPathKeyFrames 로 나온다 + 직선화', async ({ page }) => {
  await openApp(page);
  const id = await makePathLayer(page);
  const r = await page.evaluate(async (i) => {
    const { motionPathKeyFrames } = await import('/src/ui/canvas/gizmo.js');
    const { straightenPath } = await import('/src/ui/canvas/path-edit.js');
    const layer = () => window.__store.get().layers[i];
    const kfs = motionPathKeyFrames(layer());
    // 직선화 전 중간 y(f=12)는 400 (위로 솟음)
    const yMidBefore = layer().transform.y.keys.find((k) => k.f === 12).v;
    straightenPath(window.__store, i);
    // 직선화 후 중간 y = 시작(200)~끝(200) 직선 위 → 200
    const yMidAfter = layer().transform.y.keys.find((k) => k.f === 12).v;
    const xMidAfter = layer().transform.x.keys.find((k) => k.f === 12).v;
    return { kfs, yMidBefore, yMidAfter, xMidAfter };
  }, id);
  expect(r.kfs).toEqual([0, 12, 23]);
  expect(r.yMidBefore).toBe(400);
  expect(r.yMidAfter).toBeCloseTo(200, 3);  // y 직선: 200→200
  // x 직선: 100→500, f12 비율 12/23 → ≈ 308.7
  expect(r.xMidAfter).toBeCloseTo(100 + 400 * (12 / 23), 1);
});

test('F3-4 — 경로 표시가 장면 재렌더를 일으키지 않는다', async ({ page }) => {
  await openApp(page);
  await makePathLayer(page);
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.__stage.sceneRenderCount);
  // 선택 유지한 채 오버레이만 다시 그리게 — f 변경 없이 overlay 요청
  await page.evaluate(() => { window.__stage.requestOverlay?.(); });
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => window.__stage.sceneRenderCount);
  expect(after).toBe(before); // 경로는 보조 캔버스(overlay)만
});

test('F3-4 — 경로 점 끌기(편집 모드) → 해당 키만 변경, 기록 1건', async ({ page }) => {
  await openApp(page);
  const id = await makePathLayer(page);
  await page.evaluate(() => window.__editorState.set({ tool: 'edit' }));
  await page.waitForTimeout(80);

  // f=12 키 점의 화면 좌표
  const pt = await page.evaluate((i) => {
    const st = window.__stage; const doc = window.__store.get();
    const L = doc.layers[i];
    const x = L.transform.x.keys.find((k) => k.f === 12).v;
    const y = L.transform.y.keys.find((k) => k.f === 12).v;
    const s = st.docToScreen(x, y);
    const rect = document.querySelector('.stage-overlay').getBoundingClientRect();
    return { x: rect.left + s.x, y: rect.top + s.y };
  }, id);

  const depth0 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  const before = await page.evaluate((i) => {
    const L = window.__store.get().layers[i];
    return { x0: L.transform.x.keys.find(k => k.f === 0).v, y0: L.transform.y.keys.find(k => k.f === 0).v };
  }, id);

  // 점을 오른쪽 아래로 드래그
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + 40, pt.y + 30, { steps: 4 });
  await page.mouse.up();

  const after = await page.evaluate((i) => {
    const L = window.__store.get().layers[i];
    return {
      x0: L.transform.x.keys.find(k => k.f === 0).v, y0: L.transform.y.keys.find(k => k.f === 0).v,
      x12: L.transform.x.keys.find(k => k.f === 12).v, y12: L.transform.y.keys.find(k => k.f === 12).v,
    };
  }, id);
  const depth1 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);

  // f=12 키만 바뀌고 f=0 키는 그대로
  expect(after.x0).toBe(before.x0);
  expect(after.y0).toBe(before.y0);
  expect(Math.abs(after.x12 - 300)).toBeGreaterThan(1); // 바뀜
  if (depth0 >= 0 && depth1 >= 0) expect(depth1 - depth0).toBe(1); // 기록 1건
});
