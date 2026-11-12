// R28b — 공포 연출 5종: 금 가기·흘러내림·광기 왜곡·맥동 테두리·혈관 번짐.
import { test, expect } from './helpers/fixtures.js';

async function run(page, fn, arg) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  return page.evaluate(async ({ src, arg }) => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const S = 200;
    const one = (id, params, f, extra) => {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 24 });
      if (extra) extra(doc);
      const L = createLayer('effect', { effectId: id }); L.params = params; L.seed = 5;
      if (doc.__src) L.sources = [{ key: 'below', sourceId: doc.__src }];
      doc.layers[L.id] = L; doc.order.push(L.id);
      const c = mk(S, S); eng.renderFrame(c.getContext('2d'), doc, f, {});
      return c.getContext('2d').getImageData(0, 0, S, S).data;
    };
    const alphaCount = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; };
    // eslint-disable-next-line no-new-func
    return new Function('one', 'alphaCount', 'S', 'createLayer', 'arg', `return (${src})(one, alphaCount, S, createLayer, arg);`)(one, alphaCount, S, createLayer, arg);
  }, { src: fn.toString(), arg });
}

test('금 가기: 진행 0이면 그리지 않음, 다 가면 중심 근처에 선, 한 번형', async ({ page }) => {
  const r = await run(page, (one, alphaCount, S) => {
    const p0 = one('crack', { progMode: 'manual', progress: 0, shake: 0 }, 5);
    const p1 = one('crack', { progMode: 'manual', progress: 1, shake: 0 }, 5);
    let nearCenter = 0;
    for (let y = 80; y < 100; y++) for (let x = 90; x < 110; x++) if (p1[(y * S + x) * 4 + 3] > 50) nearCenter++;
    return { a0: alphaCount(p0), a1: alphaCount(p1), nearCenter };
  });
  expect(r.a0).toBe(0);
  expect(r.a1).toBeGreaterThan(500);
  expect(r.nearCenter).toBeGreaterThan(10);
});

test('맥동 테두리: 가운데는 투명, 가장자리는 칠해짐', async ({ page }) => {
  const r = await run(page, (one, alphaCount, S) => {
    const d = one('pulse-border', { veins: 0 }, 0);
    return { center: d[((S / 2) * S + S / 2) * 4 + 3], corner: d[(2 * S + 2) * 4 + 3] };
  });
  expect(r.center).toBeLessThan(10);
  expect(r.corner).toBeGreaterThan(120);
});

test('혈관 번짐: 진행이 커질수록 그린 픽셀 수가 늘어난다', async ({ page }) => {
  const r = await run(page, (one, alphaCount) => [0.1, 0.3, 0.6, 1].map((v) => alphaCount(one('veins', { progMode: 'manual', progress: v, glow: 0 }, 3))));
  for (let i = 1; i < r.length; i++) expect(r[i], `진행 ${i}`).toBeGreaterThanOrEqual(r[i - 1]);
  expect(r[3]).toBeGreaterThan(r[0]);
});

test('흘러내림: 한 번형은 진행 0이면 줄기 없음, 반복형은 루프', async ({ page }) => {
  const r = await run(page, (one, alphaCount, S) => {
    const once0 = one('drip', { mode: 'once', progMode: 'manual', progress: 0, top: 0 }, 3);
    const once1 = one('drip', { mode: 'once', progMode: 'manual', progress: 1, top: 0 }, 3);
    const l0 = one('drip', {}, 0), l24 = one('drip', {}, 24);
    let same = true; for (let i = 0; i < l0.length; i++) if (l0[i] !== l24[i]) { same = false; break; }
    return { a0: alphaCount(once0), a1: alphaCount(once1), same };
  });
  expect(r.a0).toBe(0);
  expect(r.a1).toBeGreaterThan(300);
  expect(r.same).toBe(true);
});

test('광기 왜곡: 세기 0이면 소스 그대로, 세기가 있으면 달라짐', async ({ page }) => {
  const r = await run(page, (one, alphaCount, S, createLayer) => {
    const addSrc = (doc) => {
      const s = createLayer('shape'); s.shape = { kind: 'rect', w: 120, h: 80, fill: '#88bbff', stroke: null };
      s.transform.x.value = 100; s.transform.y.value = 100; s.visible = false;
      doc.layers[s.id] = s; doc.order.push(s.id); doc.__src = s.id;
    };
    const ref = (() => { const d = one('wave', { amplitude: 0 }, 6, addSrc); return d; })();
    const zero = one('madness', { strength: 0 }, 6, addSrc);
    const on = one('madness', {}, 6, addSrc);
    let same = true; for (let i = 0; i < ref.length; i++) if (ref[i] !== zero[i]) { same = false; break; }
    let diff = 0; for (let i = 3; i < ref.length; i += 4) if (Math.abs(ref[i] - on[i]) > 10) diff++;
    return { same, diff };
  });
  expect(r.same).toBe(true);
  expect(r.diff).toBeGreaterThan(50);
});
