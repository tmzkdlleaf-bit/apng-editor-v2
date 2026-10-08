// F2-7 — 그룹 기준점 이동 시 자식 화면 위치 그대로(렌더 픽셀로 검증).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('F2-7 — 기준점 옮겨도 자식 위치 그대로(±0.5px)', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');

    // 그룹 생성(도형 둘)
    const before = new Set(Object.keys(window.__store.get().layers));
    const doc0 = window.__store.get();
    const shapes = doc0.order.filter((x) => doc0.layers[x]?.type === 'shape').slice(0, 2);
    window.__store.apply({ type: 'group', ids: shapes });
    const gid = Object.keys(window.__store.get().layers).find((id) => !before.has(id) && window.__store.get().layers[id].type === 'group');

    function renderDoc(doc) {
      // 그룹과 그 자식만 보이게
      const d = JSON.parse(JSON.stringify(doc));
      const keep = new Set([gid, ...(d.layers[gid].childOrder ?? [])]);
      for (const x of d.order) d.layers[x].visible = keep.has(x);
      return d;
    }
    async function render(doc) {
      const d = renderDoc(doc);
      const assets = await H.demoAssets(d);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = d.meta.width, Hh = d.meta.height;
      const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
      return cx.getImageData(0, 0, W, Hh).data;
    }
    // 불투명 픽셀 질량중심
    function centroid(data, W, Hh) {
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4; if (data[k + 3] < 128) continue; sx += x; sy += y; n++;
      }
      return n ? { x: sx / n, y: sy / n, n } : { x: 0, y: 0, n: 0 };
    }

    const docBefore = window.__store.get();
    const W = docBefore.meta.width, Hh = docBefore.meta.height;
    const a = centroid(await render(docBefore), W, Hh);

    // 기준점을 (200,200)으로 이동 (group-section 과 동일 로직: 자식 보정 없이 그룹 pivot 만)
    const g = window.__store.get().layers[gid];
    const dx = 200 - (g.transform.x.value ?? 0);
    const dy = 200 - (g.transform.y.value ?? 0);
    window.__store.apply({ type: 'batch', cmds: [
      { type: 'offsetProp', id: gid, path: 'transform.x', delta: dx },
      { type: 'offsetProp', id: gid, path: 'transform.y', delta: dy },
    ] });

    const b = centroid(await render(window.__store.get()), W, Hh);
    return { a, b, pivotX: window.__store.get().layers[gid].transform.x.value };
  });
  expect(r.a.n).toBeGreaterThan(0);
  expect(r.pivotX).toBe(200);                       // 기준점이 옮겨졌고
  expect(Math.abs(r.a.x - r.b.x)).toBeLessThan(0.5); // 자식 화면 위치는 그대로
  expect(Math.abs(r.a.y - r.b.y)).toBeLessThan(0.5);
});
