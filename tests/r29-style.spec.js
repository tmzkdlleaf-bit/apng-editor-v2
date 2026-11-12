// R29 — 손그림 VFX 공용 도구(_fx-style.js)와 개편 효과(불꽃·비·반짝임).
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__store); });

test('공용 도구: 홀드는 루프를 지키고, 크기 3단계 비율, 색 섞기는 문자열', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const S = await import('/src/effects/_fx-style.js');
    const { createRng } = await import('/src/core/render/rng.js');
    const rng = createRng(3);
    const tiers = [0, 0, 0];
    for (let i = 0; i < 4000; i++) tiers[S.sizeTier(rng).tier]++;
    const holds = [0, 1, 2, 3, 11, 12].map((f) => S.holdFrame(f, 2, 12));
    const holds3 = [12, 13].map((f) => S.holdFrame(f, 3, 12));
    const fl = [0, 0.1, 0.18, 0.5, 0.99].map((t) => S.flick(t, 0.18));
    return { tiers, holds, holds3, mix: S.mixCss('#ff0000', '#0000ff', 0.5), fl, once: S.onceSpan(0.5).phase };
  });
  expect(r.holds).toEqual([0, 0, 2, 2, 10, 0]);   // f=N 은 0 과 같다
  expect(r.holds3).toEqual([0, 0]);
  expect(r.tiers[2]).toBeGreaterThan(r.tiers[1]); // 작은 것이 가장 많고
  expect(r.tiers[1]).toBeGreaterThan(r.tiers[0]); // 큰 것이 가장 적다
  expect(r.tiers[0] / 4000).toBeGreaterThan(0.07);
  expect(r.tiers[0] / 4000).toBeLessThan(0.13);
  expect(typeof r.mix).toBe('string');
  expect(r.mix).toMatch(/^rgba\(/);
  expect(r.fl[2]).toBeGreaterThan(0.95);            // 빠르게 켜지고
  expect(r.fl[3]).toBeGreaterThan(r.fl[4]);          // 천천히 꺼진다
  expect(r.once).toBe('fall');
});

test('불꽃·반짝임 손그림(홀드 자동=2): 짝수 프레임과 다음 홀수 프레임이 같은 그림, 실사는 매 프레임', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const S = 128, out = {};
    const draw = (id, f, params) => {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      const L = createLayer('effect', { effectId: id }); L.params = params; L.seed = 5;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, f, {});
      return Array.from(cv.getContext('2d').getImageData(0, 0, S, S).data);
    };
    const eq = (a, b) => a.every((v, i) => v === b[i]);
    for (const id of ['flame', 'sparkle']) {
      out[id] = {
        sameInPair: eq(draw(id, 4, { look: 'cel' }), draw(id, 5, { look: 'cel' })),
        diffAcross: !eq(draw(id, 4, { look: 'cel' }), draw(id, 6, { look: 'cel' })),
        smoothDiff: !eq(draw(id, 4, { look: 'cel', hold: '1' }), draw(id, 5, { look: 'cel', hold: '1' })),
        realSmooth: !eq(draw(id, 4, {}), draw(id, 5, {})),
      };
    }
    return out;
  });
  for (const id of ['flame', 'sparkle']) {
    expect(r[id].sameInPair, `${id} 홀드`).toBe(true);
    expect(r[id].diffAcross, `${id} 다음 그림`).toBe(true);
    expect(r[id].smoothDiff, `${id} 매 프레임`).toBe(true);
    expect(r[id].realSmooth, `${id} 실사 기본은 매 프레임`).toBe(true);
  }
});

test('그림체 3종(손그림·반실사·실사): 불꽃·비·반짝임 모두 결정론·루프 이음매·무언가 그림', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const S = 128, out = {};
    const draw = (id, f, params) => {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      const L = createLayer('effect', { effectId: id }); L.params = params; L.seed = 9;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, f, {});
      return Array.from(cv.getContext('2d').getImageData(0, 0, S, S).data);
    };
    const eq = (a, b) => a.every((v, i) => v === b[i]);
    for (const id of ['flame', 'rain', 'sparkle']) for (const look of ['cel', 'semi', 'real']) {
      const a = draw(id, 5, { look }), b = draw(id, 5, { look });
      let ink = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 10) ink++;
      out[`${id}/${look}`] = { determ: eq(a, b), loop: eq(draw(id, 0, { look }), draw(id, 12, { look })), ink };
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) {
    expect(v.determ, `${k} 결정론`).toBe(true);
    expect(v.loop, `${k} 0프레임 = N프레임`).toBe(true);
    expect(v.ink, `${k} 그려짐`).toBeGreaterThan(30);
  }
});
