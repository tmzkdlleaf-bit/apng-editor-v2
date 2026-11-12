// R28e — 자연·날씨: 번개·반딧불·오로라·구름·성에 + 비·눈·창문 빗물 보강(새 값은 기본이면 예전과 같음).
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__store); });

const RUN = async ({ cases }) => {
  const { createRenderEngine } = await import('/src/core/render/frame.js');
  const { effects } = await import('/src/effects/registry.js');
  const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const eng = createRenderEngine({ createCanvas: mk, effects });
  const S = 160, out = {};
  for (const [name, c] of Object.entries(cases)) {
    const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
    const L = createLayer('effect', { effectId: c.fx }); L.params = c.params ?? {}; L.seed = 21;
    doc.layers[L.id] = L; doc.order.push(L.id);
    const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, c.f, {});
    out[name] = Array.from(cv.getContext('2d').getImageData(0, 0, S, S).data);
  }
  return out;
};
const eq = (a, b) => a.every((v, i) => v === b[i]);
const alpha = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };

test('비 겹 3·파문·진눈깨비, 눈 쌓임·앞 겹 흐림, 창문 물길·뒤집힘: 결정론·루프', async ({ page }) => {
  const sets = [
    ['rain', { depth: 3, puddle: 0.6, sleet: 0.5, splashSize: 2 }],
    ['snow', { pile: 0.15, frontBlur: 0.6, layers: 3 }],
    ['window-rain', { trail: 0.8, runFreq: 0.6 }],
  ];
  for (const [fx, params] of sets) {
    const r = await page.evaluate(RUN, { cases: { a0: { fx, params, f: 0 }, a12: { fx, params, f: 12 }, b5: { fx, params, f: 5 }, c5: { fx, params, f: 5 } } });
    expect(eq(r.a0, r.a12), `${fx} 루프`).toBe(true);
    expect(eq(r.b5, r.c5), `${fx} 결정론`).toBe(true);
  }
});

test('눈 쌓임: 바닥 띠가 칠해지고 시간이 지나도 두께가 같다(루프 규칙)', async ({ page }) => {
  const r = await page.evaluate(RUN, { cases: { f2: { fx: 'snow', params: { pile: 0.15, amount: 1 }, f: 2 }, f9: { fx: 'snow', params: { pile: 0.15, amount: 1 }, f: 9 } } });
  const S = 160, A = (d, x, y) => d[(y * S + x) * 4 + 3];
  expect(A(r.f2, 80, 155)).toBeGreaterThan(200);
  expect(A(r.f2, 80, 120)).toBeLessThan(10);
  for (const x of [20, 80, 140]) expect(A(r.f9, x, 150)).toBe(A(r.f2, x, 150));
});

test('성에 한 번형: 진행 0 이면 없음, 1 이면 가장자리에 서리, 닦인 자리는 비어 있음', async ({ page }) => {
  const r = await page.evaluate(RUN, { cases: {
    p0: { fx: 'frost', params: { mode: 'once', progMode: 'manual', progress: 0 }, f: 3 },
    p1: { fx: 'frost', params: { mode: 'once', progMode: 'manual', progress: 1 }, f: 3 },
  } });
  const S = 160, A = (d, x, y) => d[(y * S + x) * 4 + 3];
  expect(alpha(r.p0)).toBe(0);
  expect(A(r.p1, 2, 2)).toBeGreaterThan(40);
  expect(A(r.p1, 80, 80)).toBeLessThan(10);
});

test('번개: 친 프레임에는 그려지고, 안 친 프레임은 비어 있다', async ({ page }) => {
  const cases = {}; for (let f = 0; f < 12; f++) cases['f' + f] = { fx: 'lightning', params: { strikes: 1, linger: 2, look: 'cel' }, f }; // 잔상 프레임 규칙은 손그림 그림체
  const r = await page.evaluate(RUN, { cases });
  const lit = Object.values(r).map(alpha);
  expect(lit.filter((n) => n > 0).length).toBeGreaterThanOrEqual(1);
  expect(lit.filter((n) => n === 0).length).toBeGreaterThanOrEqual(8);
});
