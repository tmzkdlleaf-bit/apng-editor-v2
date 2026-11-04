// R17 레이어 효과 쌓기 성능 — 768² 레이어 1장에 효과 3개(빛무리+색수차+물결)를 쌓았을 때
// 프레임당 중앙값 ms. npm run perf 전용(작업자 1개). 큰 회귀만 잡는다.
import { test, expect } from '@playwright/test';

const LIMIT_MS = 120; // 768² + 효과 3개 스택. 평소보다 넉넉한 상한.

test('R17 효과 쌓기 성능(768², 레이어1 + 효과3, 프레임당 중앙값 ms)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const ms = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer, createFx } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 768;
    const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 24 });
    const s = createLayer('shape', { name: 'base' });
    s.shape = { kind: 'ellipse', w: S * 0.6, h: S * 0.6, fill: '#88bbff', stroke: null };
    s.transform.x.value = S / 2; s.transform.y.value = S / 2;
    s.fx = {
      g: createFx('glow', { clip: false, params: { radius: 0.9, intensity: 0.8, pulse: 1, color: '#ffd27a' } }),
      c: createFx('chromatic', { clip: true, params: { offset: 0.5, range: 'full' } }),
      w: createFx('wave', { clip: true, params: { amplitude: 0.3, wavelength: 0.25, speed: 1 } }),
    };
    s.fxOrder = ['c', 'w', 'g'];
    doc.layers[s.id] = s; doc.order.push(s.id);

    const eng = createRenderEngine({ createCanvas: mk, effects });
    const cv = mk(S, S); const cctx = cv.getContext('2d');
    eng.renderFrame(cctx, doc, 0, {}); // warmup
    const ts = [];
    for (let f = 0; f < 15; f++) { const t0 = performance.now(); eng.renderFrame(cctx, doc, f, {}); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    return ts[Math.floor(ts.length / 2)];
  });
  console.log(`R17 효과 쌓기(768², 효과 3개) 프레임당 중앙값: ${ms.toFixed(2)}ms (기준 ${LIMIT_MS})`);
  expect(ms).toBeLessThan(LIMIT_MS);
});
