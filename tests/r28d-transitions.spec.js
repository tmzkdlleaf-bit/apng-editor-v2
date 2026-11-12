// R28d — 장면 전환 7종(+홀로 코팅): 진행 0 = 나가는 화면, 1 = 들어오는 화면(픽셀 동일), 카드 뒤집기 가운데가 가장 좁음,
//   금빛 폭발은 소스 없이 그림, 홀로 코팅 루프.
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__store); });

const RUN = async ({ cases }) => {
  const { createRenderEngine } = await import('/src/core/render/frame.js');
  const { effects } = await import('/src/effects/registry.js');
  const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const S = 120;
  const img = (col, hole) => { const c = mk(S, S); const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(hole ? 20 : 0, hole ? 10 : 0, hole ? 80 : S, hole ? 100 : S);
    g.fillStyle = '#ffffff'; g.fillRect(30, 30, 20, 20); return c; };
  const bm = { a: img('#3366cc'), b: img('#cc6633'), card: img('#33aa66', true), back: img('#aa3366', true) };
  const assets = { getBitmap: (id) => bm[id], getAnimFrames: () => null };
  const eng = createRenderEngine({ createCanvas: mk, effects, assets });
  const out = {};
  for (const [name, c] of Object.entries(cases)) {
    const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 24 });
    const ids = {};
    for (const [key, asset] of Object.entries(c.src ?? {})) {
      const L = createLayer('image'); L.assetId = asset; L.transform.x.value = S / 2; L.transform.y.value = S / 2; L.visible = !!c.plain;
      doc.layers[L.id] = L; doc.order.push(L.id); ids[key] = L.id;
    }
    if (!c.plain) {
      const F = createLayer('effect', { effectId: c.fx }); F.params = c.params ?? {}; F.seed = 3;
      F.sources = Object.entries(ids).map(([key, sourceId]) => ({ key, sourceId }));
      doc.layers[F.id] = F; doc.order.push(F.id);
    }
    const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, c.f ?? 5, {});
    out[name] = Array.from(cv.getContext('2d').getImageData(0, 0, S, S).data);
  }
  return out;
};

for (const fx of ['ink-wipe', 'shatter', 'paper-burn', 'holo-transition']) {
  test(`${fx}: 진행 0 = 나가는 화면, 1 = 들어오는 화면, 중간은 섞임`, async ({ page }) => {
    const m = (v) => ({ fx, src: { out: 'a', in: 'b' }, params: { progMode: 'manual', progress: v } });
    const r = await page.evaluate(RUN, { cases: {
      A: { plain: true, src: { x: 'a' } }, B: { plain: true, src: { x: 'b' } },
      p0: m(0), p1: m(1), mid: m(0.5),
    } });
    const eq = (x, y) => x.every((v, i) => v === y[i]);
    expect(eq(r.p0, r.A), '진행 0').toBe(true);
    expect(eq(r.p1, r.B), '진행 1').toBe(true);
    expect(eq(r.mid, r.A) || eq(r.mid, r.B), '중간은 둘 다 아님').toBe(false);
  });
}

test('카드 뒤집기: 0 = 앞면, 1 = 뒷면, 가운데(0.5) 근처가 가장 좁다', async ({ page }) => {
  const m = (v) => ({ fx: 'card-flip', src: { front: 'card', back: 'back' }, params: { progMode: 'manual', progress: v, progEase: 'linear', shadow: 0, gloss: 0, lift: 0 } });
  const r = await page.evaluate(RUN, { cases: {
    F: { plain: true, src: { x: 'card' } }, Bk: { plain: true, src: { x: 'back' } },
    p0: m(0), p1: m(1), q1: m(0.25), q2: m(0.45), q3: m(0.75),
  } });
  const S = 120, eq = (x, y) => x.every((v, i) => v === y[i]);
  const width = (d) => { let n = 0; for (let x = 0; x < S; x++) if (d[(60 * S + x) * 4 + 3] > 128) n++; return n; };
  expect(eq(r.p0, r.F)).toBe(true);
  expect(eq(r.p1, r.Bk)).toBe(true);
  expect(width(r.q2)).toBeLessThan(width(r.q1));
  expect(width(r.q2)).toBeLessThan(width(r.q3));
});

test('크리티컬 금빛 폭발: 소스 없이 그리고, 진행 0·1 에서는 아무것도 없음', async ({ page }) => {
  const m = (v) => ({ fx: 'critical-burst', params: { progMode: 'manual', progress: v } });
  const r = await page.evaluate(RUN, { cases: { p0: m(0), mid: m(0.3), p1: m(1) } });
  const alpha = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
  expect(alpha(r.p0)).toBe(0);
  expect(alpha(r.p1)).toBe(0);
  expect(alpha(r.mid)).toBeGreaterThan(1000);
});

test('홀로 코팅: 루프(0 = 24), 그림 모양 밖에는 안 칠함', async ({ page }) => {
  const r = await page.evaluate(RUN, { cases: {
    f0: { fx: 'holo-foil', src: { below: 'card' }, f: 0 }, f24: { fx: 'holo-foil', src: { below: 'card' }, f: 24 },
    f8: { fx: 'holo-foil', src: { below: 'card' }, f: 8 },
  } });
  const S = 120, eq = (x, y) => x.every((v, i) => v === y[i]);
  expect(eq(r.f0, r.f24)).toBe(true);
  expect(r.f8[(5 * S + 5) * 4 + 3]).toBe(0);  // 카드(20..100 × 10..110) 밖
});
