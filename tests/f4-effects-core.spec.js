// F4 — 시험 효과(빛줄기·소스 비추기) 렌더 + 소스 슬롯 + 결정론/시드.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => true);
}

test('F4 — 레지스트리에 시험 효과 3개(점·빛줄기·소스 비추기)', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { getAllEffects } = await import('/src/effects/registry.js');
    return getAllEffects().map((e) => e.id);
  });
  expect(r).toEqual(expect.arrayContaining(['test-dots', 'test-light-rays', 'test-source-mirror']));
});

test('F4 — 빛줄기: 렌더됨 + 결정론(같은 프레임 2회 동일) + 시드 다르면 다름', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;

    function render(seed) {
      const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 24 });
      const fx = createLayer('effect', { name: 'fx', effectId: 'test-light-rays' });
      fx.seed = seed;
      fx.params = { count: 20, intensity: 1, color: '#ffffff' };
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
      const c = H.createCanvas(64, 64); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, doc, 3, {});
      return Array.from(cx.getImageData(0, 0, 64, 64).data);
    }
    const a = render(5), b = render(5), c = render(99);
    const opaque = a.filter((_, i) => i % 4 === 3 && a[i] > 0).length;
    let sameAB = a.length === b.length; for (let i = 0; sameAB && i < a.length; i++) if (a[i] !== b[i]) sameAB = false;
    let diffAC = false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) { diffAC = true; break; }
    return { opaque, sameAB, diffAC };
  });
  expect(r.opaque).toBeGreaterThan(0);  // 실제로 그려짐
  expect(r.sameAB).toBe(true);          // 같은 시드·프레임 → 동일(결정론)
  expect(r.diffAC).toBe(true);          // 시드 다르면 다름
});

test('F4 — 빛줄기: 루프 이음새 frame 0 == frame N', async ({ page }) => {
  await openApp(page);
  const same = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;
    const N = 24;
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: N });
    const fx = createLayer('effect', { name: 'fx', effectId: 'test-light-rays' });
    fx.seed = 7; fx.params = { count: 20, intensity: 1, shimmer: true };
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    const px = (f) => { const c = H.createCanvas(64, 64); const cx = c.getContext('2d', { willReadFrequently: true }); eng.invalidate?.(); eng.renderFrame(cx, doc, f, {}); return Array.from(cx.getImageData(0, 0, 64, 64).data); };
    const a = px(0), b = px(N);
    let s = a.length === b.length; for (let i = 0; s && i < a.length; i++) if (a[i] !== b[i]) s = false;
    return s;
  });
  expect(same).toBe(true);
});

test('F4-5 — 소스 슬롯: 소스 레이어 내용이 효과에 반영', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;

    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 12 });
    // 소스: 빨간 사각형
    const src = createLayer('shape', { name: 'src' });
    src.shape = { kind: 'rect', w: 64, h: 64, fill: '#ff0000', stroke: null };
    src.transform.x.value = 32; src.transform.y.value = 32;
    // 효과: 소스 비추기(소스 연결) — 소스는 숨겨도 효과엔 비친다
    const fx = createLayer('effect', { name: 'fx', effectId: 'test-source-mirror' });
    fx.params = { opacity: 1, flip: false, tint: '#ffffff' };
    fx.sources = [{ key: 'src', sourceId: src.id }];
    doc.layers[src.id] = src; doc.layers[fx.id] = fx;
    doc.order.push(src.id, fx.id);

    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    function redWith(sourceLinked) {
      const d = JSON.parse(JSON.stringify(doc));
      d.layers[src.id].visible = false;            // 소스는 숨김(효과 재료로만)
      if (!sourceLinked) d.layers[fx.id].sources = [];
      const c = H.createCanvas(64, 64); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
      const data = cx.getImageData(0, 0, 64, 64).data;
      let red = 0; for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 3] > 128) red++;
      return red;
    }
    return { linked: redWith(true), unlinked: redWith(false) };
  });
  expect(r.linked).toBeGreaterThan(1000);  // 소스가 효과에 비침(빨강)
  expect(r.unlinked).toBe(0);              // 소스 없으면 아무것도 안 비침
});
