// R31 — 실제 사진 측정 기준(docs/vfx-research-2.md) 상시 검사.
//   사진에서 잰 값(밝기 칸별 색, 가장자리 전환 폭, 가장 밝은 점)에서 효과가 벗어나지 않는지 본다.
//   + 새 기능: 불티 그라인더·불 장작·연기 결·실사 소재(언멀트·이어 붙이기) 결정론과 루프.
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__store); });

// 검은 배경 400px 에서 렌더해 사진과 같은 방식으로 잰다(자료집 §1-1).
async function measure(page, effectId, params, frames = [0, 3, 6, 9]) {
  return page.evaluate(async ({ effectId, params, frames }) => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const S = 400;
    const bins = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
    let tw = 0, top = 0, chroma = 0, nb = 0;
    for (const f of frames) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      doc.meta.background = { type: 'solid', color: '#000000' };
      const L = createLayer('effect', { effectId }); L.params = params; L.seed = 7;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const cv = mk(S, S); const g = cv.getContext('2d'); eng.renderFrame(g, doc, f, {});
      const d = g.getImageData(0, 0, S, S).data;
      const Lm = new Float32Array(S * S);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; Lm[j] = l;
        const o = bins[Math.min(7, l / 32 | 0)]; o[0] += d[i]; o[1] += d[i + 1]; o[2] += d[i + 2]; o[3]++;
        if (l > 120) { chroma += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); nb++; }
      }
      const s = Array.from(Lm).sort((a, b) => a - b);
      const p99 = s[Math.floor(s.length * 0.995)];
      top = Math.max(top, s[Math.floor(s.length * 0.9995)]);
      let band = 0, cross = 0; const mid = p99 * 0.5;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const l = Lm[y * S + x];
        if (l > p99 * 0.25 && l < p99 * 0.75) band++;
        if (x < S - 1 && ((l >= mid) !== (Lm[y * S + x + 1] >= mid))) cross++;
        if (y < S - 1 && ((l >= mid) !== (Lm[(y + 1) * S + x] >= mid))) cross++;
      }
      tw += band / Math.max(1, cross);
    }
    return { tw: tw / frames.length, top, chroma: nb ? chroma / nb : 0, bins: bins.map((o) => (o[3] ? [o[0] / o[3], o[1] / o[3], o[2] / o[3], o[3]] : null)) };
  }, { effectId, params, frames });
}

test('사진 색표: 불 색은 R 이 먼저 차고 G 는 천천히, 가장 밝아도 크림색(파랑 0 아님)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const R = await import('/src/effects/_fx-real.js');
    return { mid: R.firePhoto(0.4), hi: R.firePhoto(0.95), lo: R.firePhoto(0.15), un: R.unmultPx(128, 64, 0), zero: R.unmultPx(0, 0, 0) };
  });
  expect(r.mid[0]).toBe(255);
  expect(r.mid[1] / r.mid[0]).toBeLessThan(0.5);
  expect(r.hi[2]).toBeGreaterThan(140);                 // 사진: 가장 밝은 칸 (254,240,164)
  expect(r.lo[3]).toBeLessThan(0.5);                    // 어두운 쪽은 투명하게(빛 소재)
  expect(r.un).toEqual([255, 127.5, 0, 128 / 255]);     // 언멀트: 색 되살리기 + 밝기 = 불투명도
  expect(r.zero[3]).toBe(0);
});

test('불(실사): 중간 밝기 색이 사진처럼 붉고(G/R 0.3~0.5), 가장자리 전환 폭이 예전(18px)보다 좁다', async ({ page }) => {
  const m = await measure(page, 'flame', { look: 'real', bloom: 0, grain: 0 });
  for (const k of [2, 3]) {                              // 64~127 칸 — 사진 G/R 0.35~0.43
    const b = m.bins[k];
    expect(b, `칸 ${k}`).not.toBeNull();
    expect(b[1] / b[0], `칸 ${k} G/R`).toBeGreaterThan(0.28);
    expect(b[1] / b[0], `칸 ${k} G/R`).toBeLessThan(0.52);
  }
  const hi = m.bins[7] ?? m.bins[6];
  expect(hi[2], '가장 밝은 칸 파랑').toBeGreaterThan(60);
  expect(m.tw).toBeLessThan(18);
});

test('불티(실사): 가장 밝은 점이 사진처럼 거의 흰빛(>200) — 기본·그라인더 둘 다', async ({ page }) => {
  const a = await measure(page, 'sparks', { look: 'real' });
  const b = await measure(page, 'sparks', { look: 'real', mode: 'grinder' });
  expect(a.top).toBeGreaterThan(200);
  expect(b.top).toBeGreaterThan(200);
});

test('불꽃놀이(실사): 금속 발색 — 밝은 점의 채도가 지정색(분홍 섞기)보다 진하다', async ({ page }) => {
  const metal = await measure(page, 'fireworks', { look: 'real', grain: 0 });
  expect(metal.chroma).toBeGreaterThan(40);
});

async function lum(page, effectId, params, frames) {
  return page.evaluate(async ({ effectId, params, frames }) => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const S = 96, out = [];
    for (const f of frames) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      const L = createLayer('effect', { effectId }); L.params = params; L.seed = 3;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, f, {});
      const d = cv.getContext('2d').getImageData(0, 0, S, S).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i + 3] * (d[i] + d[i + 1] + d[i + 2]) / 765;
      out.push(sum / (S * S));
    }
    return out;
  }, { effectId, params, frames });
}

test('R31 새 설정: 결정론·0프레임 = N프레임', async ({ page }) => {
  const cases = [
    ['flame', { look: 'real', fuel: 'logs' }],
    ['sparks', { look: 'real', mode: 'grinder' }],
    ['smoke', { look: 'real', wisps: 1 }],
    ['fireworks', { look: 'real', palette: 'metal' }],
    ['aurora', { look: 'real' }],
    ['lightning', { look: 'real' }],
    ['snow', { look: 'real' }],
  ];
  for (const [id, p] of cases) {
    const a = await lum(page, id, p, [0, 12, 5, 5]);
    expect(a[0], `${id} 루프`).toBeCloseTo(a[1], 6);
    expect(a[2], `${id} 결정론`).toBeCloseTo(a[3], 6);
  }
});

test('실사 소재: 검은 배경 지우기·이어 붙이기 루프·내장 소재 3종 재생', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    // 시험 시트: 4칸, 칸마다 밝기가 다른 주황(검은 배경 위)
    const sh = mk(64, 16); const g = sh.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 16);
    ['#802000', '#ff4000', '#401000', '#c03000'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 16 + 4, 4, 8, 8); });
    const run = async (bm, params, frames, fc = 12) => {
      const eng = createRenderEngine({ createCanvas: mk, effects, assets: { getBitmap: () => bm, getAnimFrames: () => null } });
      const S = 64, out = [];
      for (const f of frames) {
        const doc = createDoc({ width: S, height: S, fps: 12, frameCount: fc });
        const src = createLayer('image', { name: 's' }); src.assetId = 'a'; src.visible = false;
        doc.layers[src.id] = src; doc.order.push(src.id);
        const fx = createLayer('effect', { effectId: 'footage' }); fx.params = params; fx.seed = 1; fx.sources = [{ key: 'clip', sourceId: src.id }];
        doc.layers[fx.id] = fx; doc.order.push(fx.id);
        const cv = mk(S, S); const c = cv.getContext('2d'); eng.renderFrame(c, doc, f, {});
        out.push(Array.from(c.getImageData(0, 0, S, S).data));
      }
      return out;
    };
    const bm = await createImageBitmap(sh);
    const one = await run(bm, { cols: 4, rows: 1, loop: 'plain', speed: 1, size: 1, position: { x: 0.5, y: 1 }, black: 0, soft: 0 }, [0]);
    const d = one[0];
    const px = (x, y) => d.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4);
    const corner = px(1, 1), mid = px(32, 32);
    const sameLoop = async (bmp, params, fc) => { const [a, b] = await run(bmp, params, [0, fc], fc); return a.every((v, i) => v === b[i]); };
    const loopOk = await sameLoop(bm, { cols: 4, rows: 1, loop: 'crossfade', speed: 0.1, size: 1 }, 12);
    const builtins = {};
    for (const [k, cols, rows] of [['fire', 8, 8], ['smoke', 8, 8], ['explosion', 8, 4]]) {
      const b2 = await createImageBitmap(await (await fetch(`/vendor/footage/${k}.webp`)).blob());
      const [f3] = await run(b2, { cols, rows, loop: k === 'explosion' ? 'once' : 'crossfade', size: 1 }, [3], 24);
      let s = 0; for (let i = 3; i < f3.length; i += 4) s += f3[i];
      builtins[k] = { drawn: s > 0, loop: k === 'explosion' ? true : await sameLoop(b2, { cols, rows, loop: 'crossfade', size: 1 }, 24) };
    }
    return { corner, mid, loopOk, builtins };
  });
  expect(r.corner[3]).toBe(0);                    // 검은 배경 → 투명
  expect(r.mid[3]).toBeGreaterThan(100);          // 주황 칸 → 불투명도 ≈ 밝기(0x80/255)
  expect(r.mid[3]).toBeLessThan(160);
  expect(r.mid[0]).toBeGreaterThan(240);          // 색은 되살아나 진한 주황(검게 타지 않음)
  expect(r.loopOk).toBe(true);
  for (const [k, v] of Object.entries(r.builtins)) {
    expect(v.drawn, `${k} 그림`).toBe(true);
    expect(v.loop, `${k} 루프`).toBe(true);
  }
});
