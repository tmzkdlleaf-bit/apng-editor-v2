// 효과 성능(768×768 프레임당 중앙값 ms) — npm run perf 전용(작업자 1개, 직렬).
// npm test(병렬)에서는 CPU 경쟁으로 측정이 요동쳐 빠졌다. 오류 없이 그리는지는 s5-1~s5-3 의
// "결정론·루프·시드·극값" 테스트가 npm test 에서 계속 확인한다.
import { test, expect } from '@playwright/test';

// 효과별 상한(평소 값의 넉넉한 배수, 최소 25ms). 큰 회귀만 잡고 중앙값은 로그로 본다.
// 평소: neon ~16, window-rain ~8, chromatic ~18, halftone ~11, hologram ~6, 나머지 <4ms.
const LIMIT = {
  neon: 45, 'window-rain': 30,
  chromatic: 60, halftone: 60, hologram: 40, vhs: 40, glitch: 40, 'tv-noise': 40, datarain: 40,
};

test('S5 효과 성능(768², 프레임당 중앙값 ms)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const perf = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects, getAllEffects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 768;
    const engFx = createRenderEngine({ createCanvas: mk, effects });
    const list = getAllEffects().filter((e) => !e.id.startsWith('test-'));
    const out = {};
    const cv = mk(S, S); const cctx = cv.getContext('2d');
    for (const eff of list) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 24 });
      let srcId = null;
      if ((eff.sources ?? []).length) {
        const shp = createLayer('shape', { name: 'src' });
        shp.shape = { kind: 'ellipse', w: S * 0.6, h: S * 0.6, fill: '#88bbff', stroke: null };
        shp.transform.x.value = S / 2; shp.transform.y.value = S / 2;
        doc.layers[shp.id] = shp; doc.order.push(shp.id); srcId = shp.id;
      }
      const fx = createLayer('effect', { name: 'fx', effectId: eff.id });
      fx.params = {}; for (const d of (eff.params ?? [])) fx.params[d.key] = d.default;
      if (srcId) fx.sources = eff.sources.map((s) => ({ key: s.key, sourceId: srcId }));
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      engFx.renderFrame(cctx, doc, 0, {}); // warmup
      const ts = [];
      for (let f = 0; f < 15; f++) { const t0 = performance.now(); engFx.renderFrame(cctx, doc, f, {}); ts.push(performance.now() - t0); }
      ts.sort((a, b) => a - b);
      out[eff.id] = ts[Math.floor(ts.length / 2)];
    }
    return out;
  });
  const lines = Object.entries(perf)
    .sort((a, b) => b[1] - a[1])
    .map(([id, ms]) => `${id}: ${ms.toFixed(2)}ms (기준 ${LIMIT[id] ?? 25})`);
  console.log('S5 효과 성능(768², 프레임당 중앙값, 느린 순):\n  ' + lines.join('\n  '));
  for (const [id, ms] of Object.entries(perf)) expect(ms, `${id} 성능`).toBeLessThan(LIMIT[id] ?? 25);
});
