// R27 풀·수풀 흔들림 4종 — 바람 흔들림(띠)·기울기 흔들림(skewX)·바람 휘기(소스)·풀숲.
import { test, expect } from './helpers/fixtures.js';

async function setup(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
}

test('바람 흔들림: 뿌리 띠는 그대로, 끝은 밀림, 띠 사이 틈 0, 레이어 폭 밖도 그려짐', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const motions = (await import('/src/motions/registry.js')).default;
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const bmp = mk(40, 120); { const c = bmp.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 40, 120); }
    const assets = { getBitmap: () => bmp, getAnimFrames: () => null };
    const eng = createRenderEngine({ createCanvas: mk, assets, motions });
    const doc = createDoc({ width: 200, height: 200, fps: 12, frameCount: 24 });
    const L = createLayer('image', { name: 'img' }); L.assetId = 'a';
    L.transform.x.value = 100; L.transform.y.value = 100;   // 콘텐츠 80..120 × 40..160
    L.clips = [{ id: 'c', motionId: 'wind-sway', start: 0, length: 24, loop: true, params: { strength: 30 }, gain: 1 }];
    doc.layers[L.id] = L; doc.order.push(L.id);
    const res = [];
    for (const f of [3, 6, 9]) {
      const c = mk(200, 200); eng.renderFrame(c.getContext('2d'), doc, f, {});
      const d = c.getContext('2d').getImageData(0, 0, 200, 200).data;
      const rowSum = (y) => { let s = 0; for (let x = 0; x < 200; x++) s += d[(y * 200 + x) * 4 + 3]; return s; };
      const rowLeft = (y) => { for (let x = 0; x < 200; x++) if (d[(y * 200 + x) * 4 + 3] > 128) return x; return -1; };
      let minRow = Infinity;
      for (let y = 41; y < 159; y++) minRow = Math.min(minRow, rowSum(y));
      res.push({ f, minRow, rootLeft: rowLeft(158), tipLeft: rowLeft(42) });
    }
    return res;
  });
  for (const it of r) {
    expect(it.minRow, `f${it.f} 띠 사이 틈 없음(줄마다 알파 합)`).toBeGreaterThan(40 * 255 * 0.95);
    expect(Math.abs(it.rootLeft - 80), `f${it.f} 뿌리 줄 제자리`).toBeLessThanOrEqual(1);
  }
  expect(Math.max(...r.map((it) => Math.abs(it.tipLeft - 80))), '끝은 밀림(레이어 폭 밖까지)').toBeGreaterThan(8);
});

test('기울기 흔들림: 아래 끝 고정, 위 끝 이동, 0이면 예전과 같음, 클릭이 기울어진 모양을 따라감', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const motions = (await import('/src/motions/registry.js')).default;
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { hitTest } = await import('/src/ui/canvas/hit.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, motions });
    function build(strength) {
      const doc = createDoc({ width: 200, height: 200, fps: 12, frameCount: 24 });
      const L = createLayer('shape', { name: 's' });
      L.shape = { kind: 'rect', w: 20, h: 120, fill: '#ffffff', stroke: null };
      L.transform.x.value = 100; L.transform.y.value = 100;   // 90..110 × 40..160
      if (strength !== null) L.clips = [{ id: 'c', motionId: 'wind-skew', start: 0, length: 24, loop: true, params: { strength }, gain: 1 }];
      doc.layers[L.id] = L; doc.order.push(L.id);
      return { doc, id: L.id };
    }
    const left = (d, y) => { for (let x = 0; x < 200; x++) if (d[(y * 200 + x) * 4 + 3] > 128) return x; return -1; };
    const draw = (doc, f) => { const c = mk(200, 200); eng.renderFrame(c.getContext('2d'), doc, f, {}); return c.getContext('2d').getImageData(0, 0, 200, 200).data; };
    const A = build(20), Z = build(0), N = build(null);
    const f = 6; // 1/4 바퀴 — 가장 많이 기울어짐
    const dA = draw(A.doc, f), dZ = draw(Z.doc, f), dN = draw(N.doc, f);
    let zeroSame = true; for (let i = 0; i < dZ.length; i++) if (dZ[i] !== dN[i]) { zeroSame = false; break; }
    const topShift = left(dA, 42) - left(dN, 42);
    const botShift = left(dA, 158) - left(dN, 158);
    // 클릭: 기울어진 위쪽 끝 가운데(원래 자리 밖)를 누르면 이 레이어가 잡힌다
    const hitTop = hitTest(A.doc, 100 + topShift, 45, f, null, null);
    const hitOld = hitTest(A.doc, 100, 45, f, null, null);
    return { zeroSame, topShift, botShift, hitTop: hitTop === A.id, hitOld: hitOld === A.id };
  });
  expect(r.zeroSame, '세기 0 = 모션 없음과 픽셀 동일').toBe(true);
  expect(Math.abs(r.botShift), '아래 끝 고정').toBeLessThanOrEqual(1);
  expect(Math.abs(r.topShift), '위 끝 이동').toBeGreaterThan(15);
  expect(r.hitTop, '기울어진 끝을 누르면 잡힘').toBe(true);
  expect(r.hitOld, '원래 자리(이제 비어 있음)는 안 잡힘').toBe(false);
});

test('바람 휘기: 세기 0이면 소스와 픽셀 동일, 뿌리 줄은 그대로, 끝은 휨', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    function build(strength, withFx = true) {
      const doc = createDoc({ width: 200, height: 200, fps: 12, frameCount: 24 });
      const s = createLayer('shape', { name: 'stalk' });
      s.shape = { kind: 'rect', w: 12, h: 140, fill: '#88cc66', stroke: null };
      s.transform.x.value = 100; s.transform.y.value = 120;  // 94..106 × 50..190
      doc.layers[s.id] = s; doc.order.push(s.id);
      if (withFx) {
        s.visible = false;
        const fx = createLayer('effect', { effectId: 'wind-bend' }); fx.params = { strength }; fx.seed = 3;
        fx.sources = [{ key: 'below', sourceId: s.id }];
        doc.layers[fx.id] = fx; doc.order.push(fx.id);
      }
      return doc;
    }
    const draw = (doc, f) => { const c = mk(200, 200); eng.renderFrame(c.getContext('2d'), doc, f, {}); return c.getContext('2d').getImageData(0, 0, 200, 200).data; };
    const left = (d, y) => { for (let x = 0; x < 200; x++) if (d[(y * 200 + x) * 4 + 3] > 128) return x; return -1; };
    const src = draw(build(0, false), 5), zero = draw(build(0), 5);
    let same = true; for (let i = 0; i < src.length; i++) if (src[i] !== zero[i]) { same = false; break; }
    let tipMax = 0, rootMax = 0;
    const doc = build(40);
    for (const f of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const d = draw(doc, f);
      tipMax = Math.max(tipMax, Math.abs(left(d, 52) - 94));
      rootMax = Math.max(rootMax, Math.abs(left(d, 188) - 94));
    }
    return { same, tipMax, rootMax };
  });
  expect(r.same, '세기 0 = 소스').toBe(true);
  expect(r.rootMax, '뿌리 줄 제자리').toBeLessThanOrEqual(1);
  expect(r.tipMax, '끝은 휨').toBeGreaterThan(10);
});

test('풀숲: 바람 0이면 모든 프레임 같음, 바닥선 아래는 그리지 않음, 루프', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    function build(params) {
      const doc = createDoc({ width: 200, height: 200, fps: 12, frameCount: 24 });
      const fx = createLayer('effect', { effectId: 'grass' }); fx.params = params; fx.seed = 9;
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return doc;
    }
    const draw = (doc, f) => { const c = mk(200, 200); eng.renderFrame(c.getContext('2d'), doc, f, {}); return c.getContext('2d').getImageData(0, 0, 200, 200).data; };
    const eq = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const still = build({ strength: 0 });
    const calm = eq(draw(still, 2), draw(still, 13));
    const g = build({ ground: 0.6, depth: 1 });
    const d = draw(g, 5);
    let below = 0; for (let y = 122; y < 200; y++) for (let x = 0; x < 200; x++) below += d[(y * 200 + x) * 4 + 3];
    const moving = build({});
    const loop = eq(draw(moving, 0), draw(moving, 24));
    const changes = !eq(draw(moving, 0), draw(moving, 6));
    return { calm, below, loop, changes };
  });
  expect(r.calm, '바람 0 → 정지').toBe(true);
  expect(r.below, '바닥선 아래 투명').toBe(0);
  expect(r.loop, '루프 이음매').toBe(true);
  expect(r.changes, '바람이 있으면 움직임').toBe(true);
});
