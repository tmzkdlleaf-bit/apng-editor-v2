// F4 — 이펙트 갤러리(1)·파라미터 UI(2)·시드(3)·소스(5)·박스 범위(6).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}
function fxSec(page) { return page.locator('.inspector-section', { hasText: '이펙트' }); }

test('F4-1 — 갤러리: 분류·검색, 카드 선택 → 효과 레이어·기록 1건', async ({ page }) => {
  await openApp(page);
  const depth0 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  await page.click('.tl-layers-head .tl-add-btn');
  await page.click('.layer-add-item[data-kind="effect"]');
  await expect(page.locator('.gallery-panel')).toBeVisible();

  // 검색 "마법진" → magic-circle 만(이름 고유). 시험 효과는 갤러리에서 숨김(S5-5).
  await page.fill('.gallery-search', '마법진');
  await expect(page.locator('.gallery-grid .gallery-card')).toHaveCount(1);
  await page.locator('.gallery-card[data-id="magic-circle"]').dblclick();

  const r = await page.evaluate(() => {
    const id = window.__editorState.get().selection[0];
    const l = window.__store.get().layers[id];
    return { type: l?.type, effectId: l?.effectId };
  });
  expect(r.type).toBe('effect');
  expect(r.effectId).toBe('magic-circle');
  const depth1 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  if (depth0 >= 0 && depth1 >= 0) expect(depth1 - depth0).toBe(1);
});

async function addLightRays(page) {
  return page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const { getEffect } = await import('/src/effects/registry.js');
    const e = getEffect('test-light-rays');
    const params = {}; for (const p of e.params) params[p.key] = p.default;
    const l = createLayer('effect', { name: '빛줄기', effectId: 'test-light-rays' });
    l.params = params; l.seed = 5;
    window.__store.apply({ type: 'addLayer', layer: l, index: window.__store.get().order.length });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  });
}

test('F4-2 — 파라미터 UI: 모든 타입이 칸으로 생성', async ({ page }) => {
  await openApp(page);
  await addLightRays(page);
  await page.waitForTimeout(100);
  const sec = fxSec(page);
  await expect(sec).toBeVisible();
  // 슬라이더(int/float), 색 칸, 드롭다운(select·범위), 체크박스(bool), 좌표(2 숫자)
  expect(await sec.locator('.slider-range').count()).toBeGreaterThanOrEqual(3);
  expect(await sec.locator('.color-field').count()).toBeGreaterThanOrEqual(1);
  expect(await sec.locator('.dropdown').count()).toBeGreaterThanOrEqual(1);
  expect(await sec.locator('.fx-check input').count()).toBeGreaterThanOrEqual(1);
});

test('F4-2 — 파라미터 값 변경 → 렌더 변화', async ({ page }) => {
  await openApp(page);
  const id = await addLightRays(page);
  const r = await page.evaluate(async (i) => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const effects = (await import('/src/effects/registry.js')).effects;
    function opaque() {
      const doc = window.__store.get();
      const d = JSON.parse(JSON.stringify(doc));
      for (const x of d.order) d.layers[x].visible = (x === i);
      const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
      const c = H.createCanvas(d.meta.width, d.meta.height); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 3, {});
      const data = cx.getImageData(0, 0, d.meta.width, d.meta.height).data;
      let n = 0; for (let k = 3; k < data.length; k += 4) if (data[k] > 0) n++;
      return n;
    }
    const before = opaque();
    window.__store.apply({ type: 'setLayer', id: i, patch: { params: { ...window.__store.get().layers[i].params, count: 60, intensity: 1 } } });
    const after = opaque();
    return { before, after };
  }, id);
  expect(r.after).not.toBe(r.before); // 파라미터 바꾸면 렌더 변함
});

test('F4-3 — 시드 다시 생성 → 렌더 변화, 같은 시드 → 같은 렌더', async ({ page }) => {
  await openApp(page);
  const id = await addLightRays(page);
  const r = await page.evaluate(async (i) => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const effects = (await import('/src/effects/registry.js')).effects;
    function px(seed) {
      const d = JSON.parse(JSON.stringify(window.__store.get()));
      for (const x of d.order) d.layers[x].visible = (x === i);
      d.layers[i].seed = seed;
      const W = d.meta.width, Hh = d.meta.height;
      const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
      const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 3, {});
      return Array.from(cx.getImageData(0, 0, W, Hh).data);
    }
    const a = px(5), a2 = px(5), b = px(123);
    let same = true; for (let k = 0; k < a.length; k++) if (a[k] !== a2[k]) { same = false; break; }
    let diff = false; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { diff = true; break; }
    return { same, diff };
  }, id);
  expect(r.same).toBe(true);
  expect(r.diff).toBe(true);
});

test('F4-6 — 박스 범위: 박스 밖 픽셀 투명', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;
    const doc = createDoc({ width: 128, height: 128, fps: 12, frameCount: 12 });
    const fx = createLayer('effect', { name: 'fx', effectId: 'test-dots' });
    fx.params = { count: 2000, radius: 3, color: '#ffffff', phase: false };
    fx.seed = 3; fx.scope = 'box'; fx.box = { w: 40, h: 40 };
    fx.transform.x.value = 64; fx.transform.y.value = 64; // 중앙
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    const c = H.createCanvas(128, 128); const cx = c.getContext('2d', { willReadFrequently: true });
    eng.invalidate?.(); eng.renderFrame(cx, doc, 0, {});
    const data = cx.getImageData(0, 0, 128, 128).data;
    const alphaAt = (x, y) => data[(y * 128 + x) * 4 + 3];
    // 모서리(박스 밖)는 투명, 중앙(박스 안)은 점 존재
    const corner = alphaAt(5, 5);
    let centerOpaque = 0;
    for (let y = 50; y < 78; y++) for (let x = 50; x < 78; x++) if (alphaAt(x, y) > 0) centerOpaque++;
    return { corner, centerOpaque };
  });
  expect(r.corner).toBe(0);             // 박스 밖 투명
  expect(r.centerOpaque).toBeGreaterThan(0); // 박스 안 점
});
