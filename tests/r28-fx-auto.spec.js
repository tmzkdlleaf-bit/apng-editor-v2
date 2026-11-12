// R28 — 새 분류(공포·변형·전환) 효과 자동 검사: 결정론·루프(반복형)·파라미터 극값·NaN 없음.
//   날씨 분류 새 효과는 s5-1 이 같은 검사를 한다.
import { test, expect } from './helpers/fixtures.js';

const CATS = ['공포', '변형', '전환'];

test('R28 새 효과 — 결정론·루프·극값', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const res = await page.evaluate(async (CATS) => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects, getAllEffects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 160, FC = 12;
    const eng = createRenderEngine({ createCanvas: mk, effects });
    function buildDoc(eff, params) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: FC });
      const srcIds = [];
      (eff.sources ?? []).forEach((s, i) => {
        const shp = createLayer('shape', { name: 'src' + i });
        shp.shape = { kind: i ? 'rect' : 'ellipse', w: S * 0.6, h: S * 0.5, fill: i ? '#ff9966' : '#88bbff', stroke: null };
        shp.transform.x.value = S / 2; shp.transform.y.value = S / 2; shp.visible = false;
        doc.layers[shp.id] = shp; doc.order.push(shp.id); srcIds.push(shp.id);
      });
      const fx = createLayer('effect', { name: 'fx', effectId: eff.id });
      fx.params = params; fx.seed = 4242;
      fx.sources = (eff.sources ?? []).map((s, i) => ({ key: s.key, sourceId: srcIds[i] }));
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return doc;
    }
    const data = (doc, f) => { const c = mk(S, S); eng.renderFrame(c.getContext('2d'), doc, f, {}); return c.getContext('2d').getImageData(0, 0, S, S).data; };
    const diffFrac = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 2 || Math.abs(a[i + 3] - b[i + 3]) > 2) d++; return d / (a.length / 4); };
    const defP = (e) => { const p = {}; for (const d of e.params ?? []) p[d.key] = d.default; return p; };
    const ext = (e, w) => { const p = {}; for (const d of e.params ?? []) {
      if (d.type === 'int' || d.type === 'float') p[d.key] = w === 'min' ? d.min : d.max;
      else if (d.type === 'coord') p[d.key] = w === 'min' ? { x: 0, y: 0 } : { x: 1, y: 1 };
      else if (d.type === 'select') { const o = d.options ?? []; p[d.key] = (w === 'min' ? o[0] : o[o.length - 1])?.value ?? d.default; }
      else if (d.type === 'bool') p[d.key] = w !== 'min';
      else p[d.key] = d.default; } return p; };
    const out = {};
    for (const eff of getAllEffects().filter((e) => CATS.includes(e.category))) {
      const doc = buildDoc(eff, defP(eff));
      const once = typeof eff.once === 'function' ? eff.once(defP(eff)) : !!eff.once;
      const determ = diffFrac(data(doc, 5), data(doc, 5)) === 0;
      const loopFrac = once ? 0 : diffFrac(data(doc, 0), data(doc, FC));
      let extremesOk = true, err = '';
      try { for (const w of ['min', 'max']) { const d = buildDoc(eff, ext(eff, w)); data(d, 0); data(d, 3); data(d, 7); } }
      catch (e) { extremesOk = false; err = String(e); }
      const drew = data(doc, 6).some((v, i) => i % 4 === 3 && v > 0) || data(doc, 11).some((v, i) => i % 4 === 3 && v > 0);
      out[eff.id] = { determ, loopFrac, extremesOk, err, drew, once };
    }
    return out;
  }, CATS);
  for (const [id, r] of Object.entries(res)) {
    expect(r.determ, `${id} 결정론`).toBe(true);
    expect(r.loopFrac, `${id} 루프 이음매`).toBeLessThan(0.01);
    expect(r.extremesOk, `${id} 파라미터 극값 ${r.err}`).toBe(true);
    expect(r.drew, `${id} 기본값으로 무언가 그림`).toBe(true);
  }
});
