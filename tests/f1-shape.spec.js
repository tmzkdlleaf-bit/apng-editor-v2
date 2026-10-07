// F1-8 — 도형 속성(종류·채움/그라디언트·선·둥글기·꼭짓점). 별·그라디언트 렌더 확장 포함.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}
function shapeId(page) {
  return page.evaluate(() => {
    const doc = window.__store.get();
    // 배경(400² 또는 768²)이 아닌 작은 도형을 고른다
    return doc.order.find((id) => doc.layers[id]?.type === 'shape' && (doc.layers[id].shape?.w ?? 999) <= 120);
  });
}
function section(page) { return page.locator('.inspector-section', { hasText: '도형' }); }

test.describe('F1-8 — 도형', () => {
  test('[종류] 별로 변경 → store 기록 1건 → 되돌리기 → 원래', async ({ page }) => {
    await openApp(page);
    const id = await shapeId(page);
    await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
    await page.waitForTimeout(80);
    const before = await page.evaluate((i) => window.__store.get().layers[i].shape.kind, id);

    const sec = section(page);
    await sec.locator('.dropdown').first().click(); // 종류 드롭다운
    await page.locator('.dropdown-list [data-value="star"]').click();

    const after = await page.evaluate((i) => window.__store.get().layers[i].shape.kind, id);
    expect(after).toBe('star');
    expect(after).not.toBe(before);

    await page.evaluate(() => window.__store.undo());
    const reverted = await page.evaluate((i) => window.__store.get().layers[i].shape.kind, id);
    expect(reverted).toBe(before);
  });

  test('[렌더] 별은 같은 크기 사각형보다 불투명 픽셀이 적다(뾰족한 모양)', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'shape' && (doc.layers[x].shape?.w ?? 999) <= 120);
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function opaque(shape) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const x of d.order) d.layers[x].visible = (x === id);
        d.layers[id].shape = shape;
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
        const data = cx.getImageData(0, 0, W, Hh).data;
        let n = 0; for (let k = 3; k < data.length; k += 4) if (data[k] >= 128) n++;
        return n;
      }
      const rect = opaque({ kind: 'rect', w: 120, h: 120, fill: '#ffffff', stroke: null });
      const star = opaque({ kind: 'star', w: 120, h: 120, sides: 5, innerRatio: 0.5, fill: '#ffffff', stroke: null });
      return { rect, star };
    });
    expect(r.star).toBeGreaterThan(0);
    expect(r.star).toBeLessThan(r.rect);
  });

  test('[렌더] 선형 그라디언트 → 좌우 색이 다르다', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'shape' && (doc.layers[x].shape?.w ?? 999) <= 120);
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      const d = JSON.parse(JSON.stringify(doc));
      for (const x of d.order) d.layers[x].visible = (x === id);
      const L = d.layers[id];
      L.shape = { kind: 'rect', w: 200, h: 200, stroke: null,
        fill: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } };
      const cxVal = L.transform.x.value, cyVal = L.transform.y.value;
      const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
      const img = cx.getImageData(0, 0, W, Hh).data;
      const at = (x, y) => { const k = (y * W + x) * 4; return [img[k], img[k + 1], img[k + 2], img[k + 3]]; };
      // 도형 좌/우 가장자리 근처 픽셀
      const left = at(Math.round(cxVal - 80), Math.round(cyVal));
      const right = at(Math.round(cxVal + 80), Math.round(cyVal));
      return { left, right };
    });
    // 왼쪽은 빨강 우세, 오른쪽은 파랑 우세
    expect(r.left[0]).toBeGreaterThan(r.left[2]);
    expect(r.right[2]).toBeGreaterThan(r.right[0]);
  });

  test('[UI] 채움을 선형 그라디언트로 → fill 이 객체가 됨', async ({ page }) => {
    await openApp(page);
    const id = await shapeId(page);
    await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
    await page.waitForTimeout(80);
    const sec = section(page);
    // 채움 드롭다운(둘째 드롭다운: 종류·채움 순) 열어 '선형 그라디언트'
    await sec.locator('.dropdown').nth(1).click();
    await page.locator('.dropdown-list [data-value="linear"]').click();
    const fill = await page.evaluate((i) => window.__store.get().layers[i].shape.fill, id);
    expect(typeof fill).toBe('object');
    expect(fill.type).toBe('linear');
    expect(Array.isArray(fill.stops)).toBe(true);
    expect(fill.stops.length).toBeGreaterThanOrEqual(2);
  });
});
