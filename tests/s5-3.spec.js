// S5-3 효과(판타지 7 + 연출 14) — 결정론·루프·시드·극값·성능.
import { test, expect } from '@playwright/test';

const CATS = new Set(['판타지', '연출']);
// 시드(rng)에 의존하지 않는 효과 — 시드 변화 검사 제외.
const NO_SEED = new Set([
  'magic-circle', 'aura', 'energy-orb', 'magic-shield',
  'comic-flash', 'impact-flash', 'ripple', 'shockwave', 'countdown',
  'iris', 'letterbox', 'curtain', 'spotlight', 'focus-sun',
]);

test('S5-3 — 효과 결정론·루프·시드·극값', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const res = await page.evaluate(async (catsArr) => {
    const cats = new Set(catsArr);
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects, getAllEffects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 160;
    const eng = createRenderEngine({ createCanvas: mk, effects });

    function buildDoc(eff, params, seed) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      let srcId = null;
      if ((eff.sources ?? []).length) {
        const shp = createLayer('shape', { name: 'src' });
        shp.shape = { kind: 'ellipse', w: S * 0.6, h: S * 0.6, fill: '#88bbff', stroke: null };
        shp.transform.x.value = S / 2; shp.transform.y.value = S / 2;
        doc.layers[shp.id] = shp; doc.order.push(shp.id); srcId = shp.id;
      }
      const fx = createLayer('effect', { name: 'fx', effectId: eff.id });
      fx.params = params; fx.seed = seed;
      if (srcId) fx.sources = (eff.sources).map((s) => ({ key: s.key, sourceId: srcId }));
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return doc;
    }
    function renderData(doc, f) {
      const c = mk(S, S); eng.renderFrame(c.getContext('2d'), doc, f, {});
      return c.getContext('2d').getImageData(0, 0, S, S).data;
    }
    function diffFrac(a, b) {
      let diff = 0; const px = a.length / 4;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) > 2 || Math.abs(a[i + 1] - b[i + 1]) > 2 ||
            Math.abs(a[i + 2] - b[i + 2]) > 2 || Math.abs(a[i + 3] - b[i + 3]) > 2) diff++;
      }
      return diff / px;
    }
    function defParams(eff) { const p = {}; for (const d of (eff.params ?? [])) p[d.key] = d.default; return p; }
    function extremeParams(eff, which) {
      const p = {};
      for (const d of (eff.params ?? [])) {
        if (d.type === 'int' || d.type === 'float') p[d.key] = which === 'min' ? d.min : d.max;
        else if (d.type === 'coord') p[d.key] = which === 'min' ? { x: 0, y: 0 } : { x: 1, y: 1 };
        else if (d.type === 'select') { const o = d.options ?? []; p[d.key] = (which === 'min' ? o[0] : o[o.length - 1])?.value ?? d.default; }
        else if (d.type === 'bool') p[d.key] = which === 'min' ? false : true;
        else p[d.key] = d.default;
      }
      return p;
    }

    const list = getAllEffects().filter((e) => cats.has(e.category) && !e.id.startsWith('test-'));
    const out = {};
    for (const eff of list) {
      const dp = defParams(eff);
      const doc = buildDoc(eff, dp, 12345);
      const a1 = renderData(doc, 5), a2 = renderData(doc, 5);
      const determ = diffFrac(a1, a2) === 0;
      const l0 = renderData(doc, 0), lN = renderData(doc, 12);
      const loopFrac = diffFrac(l0, lN);
      const docB = buildDoc(eff, dp, 98765);
      const seedDiff = diffFrac(renderData(doc, 5), renderData(docB, 5)) > 0;
      let extremesOk = true;
      try { renderData(buildDoc(eff, extremeParams(eff, 'min'), 7), 3); renderData(buildDoc(eff, extremeParams(eff, 'max'), 7), 3); }
      catch { extremesOk = false; }
      out[eff.id] = { determ, loopFrac, seedDiff, extremesOk };
    }
    return out;
  }, [...CATS]);

  // 판타지 7 + 연출 14 = 21종이 전부 등록됐는지
  expect(Object.keys(res).length, '판타지+연출 효과 수').toBe(21);

  for (const id of Object.keys(res)) {
    const r = res[id];
    expect(r.determ, `${id} 결정론`).toBe(true);
    expect(r.loopFrac, `${id} 루프 이음매(차이 비율)`).toBeLessThan(0.01);
    expect(r.extremesOk, `${id} 파라미터 극값`).toBe(true);
    if (!NO_SEED.has(id)) expect(r.seedDiff, `${id} 시드 변화`).toBe(true);
  }
});

test('S5-3 — 성능(768×768 프레임당 중앙값 ms)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const perf = await page.evaluate(async (catsArr) => {
    const cats = new Set(catsArr);
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects, getAllEffects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 768;
    const engFx = createRenderEngine({ createCanvas: mk, effects });
    const list = getAllEffects().filter((e) => cats.has(e.category) && !e.id.startsWith('test-'));
    const out = {};
    const cv = mk(S, S); const cctx = cv.getContext('2d');
    for (const eff of list) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 24 });
      const fx = createLayer('effect', { name: 'fx', effectId: eff.id });
      fx.params = {}; for (const d of (eff.params ?? [])) fx.params[d.key] = d.default;
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      engFx.renderFrame(cctx, doc, 0, {});
      const ts = [];
      for (let f = 0; f < 15; f++) { const t0 = performance.now(); engFx.renderFrame(cctx, doc, f, {}); ts.push(performance.now() - t0); }
      ts.sort((a, b) => a - b);
      out[eff.id] = ts[Math.floor(ts.length / 2)];
    }
    return out;
  }, [...CATS]);
  const lines = Object.entries(perf).map(([id, ms]) => `${id}: ${ms.toFixed(2)}ms`);
  console.log('S5-3 성능(768², 프레임당 중앙값):\n  ' + lines.join('\n  '));
  for (const [id, ms] of Object.entries(perf)) expect(ms, `${id} 성능`).toBeLessThan(25);
});
