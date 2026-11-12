// R30 — 실사 통합 지침(docs/vfx-guide-real.md) 공용 도구와 대표 효과(불꽃·비·번개·반짝임) 수치 검사.
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__store); });

test('공용 도구: 낙하 속도·셔터 흐림 길이·닫힌 식 운동·이미터 루프·조리개 갈래', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const R = await import('/src/effects/_fx-real.js');
    const { dropSpeed } = await import('/src/effects/rain.js');
    const W = R.world({ f: 3, frameCount: 24, fps: 24, h: 768 }, { worldHeight: 3, shutter: 180 });
    // 빗줄기: 9 m/s → 24fps·180° 에서 0.1875 m = 48 px (자료집 환산표 19 cm)
    const c = document.createElement('canvas').getContext('2d');
    const L = R.streak(c, 100, 100, 0, 9 * W.pxPerM, W, 1, '#fff', 1);
    // 닫힌 식: 저항 없음 = 포물선, 저항 있음 → 종단 속도로 수렴
    const free = R.integrate(0, 0, 0, 0, 0, 9.8, 0, 1);
    const drag = R.integrate(0, 0, 0, 0, 0, 9.8, 2, 20);
    // 이미터: 루프 시작(t=0)과 끝(t=L)이 같은 입자·같은 나이
    const snap = (t) => { const out = []; R.emit({ count: 20, life: [0.4, 3], seed: 5 }, t, 2, (i, age, u, Rr) => out.push([i, age.toFixed(6), Rr(1).toFixed(6)])); return JSON.stringify(out); };
    return {
      v5: dropSpeed(5), v2: dropSpeed(2), v05: dropSpeed(0.5), pxPerM: W.pxPerM, L,
      free, dragVy: drag.vy, loopSame: snap(0) === snap(2), loopDiff: snap(0) !== snap(0.7),
      spikes: [0, 5, 6, 7, 8, 9].map(R.spikeCount),
    };
  });
  expect(r.v5).toBeGreaterThan(8.5); expect(r.v5).toBeLessThan(9.5);
  expect(r.v2).toBeGreaterThan(6.0); expect(r.v2).toBeLessThan(7.0);
  expect(r.v05).toBeLessThan(3);
  expect(r.L).toBeGreaterThan(48 * 0.8); expect(r.L).toBeLessThan(48 * 1.2);
  expect(r.free.y).toBeCloseTo(4.9, 3);
  expect(r.dragVy).toBeCloseTo(4.9, 2);                  // 종단 속도 a/k
  expect(r.loopSame).toBe(true);
  expect(r.loopDiff).toBe(true);
  expect(r.spikes).toEqual([0, 10, 6, 14, 8, 18]);
});

async function frameLuma(page, effectId, params, fps, fc, frames) {
  return page.evaluate(async ({ effectId, params, fps, fc, frames }) => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const S = 96, out = [];
    for (const f of frames) {
      const doc = createDoc({ width: S, height: S, fps, frameCount: fc });
      const L = createLayer('effect', { effectId }); L.params = params; L.seed = 3;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, f, {});
      const d = cv.getContext('2d').getImageData(0, 0, S, S).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i + 3] * (d[i] + d[i + 1] + d[i + 2]) / 765;
      out.push(sum / (S * S));
    }
    return out;
  }, { effectId, params, fps, fc, frames });
}

test('번개(실사): 한 번 칠 때 2프레임 이상 밝고, 첫 번째가 가장 밝다', async ({ page }) => {
  const fc = 48, frames = Array.from({ length: fc }, (_, i) => i);
  const lum = await frameLuma(page, 'lightning', { strikes: 1, restrike: 4, flash: 1, grain: 0 }, 24, fc, frames);
  const peak = Math.max(...lum);
  const lit = lum.map((v) => v > peak * 0.1);
  const first = lit.indexOf(true);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(lit.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  expect(lum[first]).toBeCloseTo(peak, 5);
});

test('실사 4종: 결정론·0프레임 = N프레임·무언가 그림', async ({ page }) => {
  for (const id of ['flame', 'rain', 'lightning', 'sparkle']) {
    const a = await frameLuma(page, id, { look: 'real' }, 12, 12, [0, 12, 5, 5]);
    expect(a[0], `${id} 루프`).toBeCloseTo(a[1], 6);
    expect(a[2], `${id} 결정론`).toBeCloseTo(a[3], 6);
  }
  const fl = await frameLuma(page, 'flame', { look: 'real' }, 12, 12, [3]);
  expect(fl[0]).toBeGreaterThan(1);
});
