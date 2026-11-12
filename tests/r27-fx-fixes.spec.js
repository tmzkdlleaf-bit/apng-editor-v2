// R27 정비 — 안개·코스틱 격자 줄, "밝은 배경용", 시험용 효과·모션 정리.
import { test, expect } from './helpers/fixtures.js';

async function setup(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
}

test('안개·코스틱: 칸 경계에 격자 줄이 없다(경계 픽셀이 이웃보다 튀지 않음)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 256, CELLS = 16, CW = S / CELLS;
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const out = {};
    for (const [id, params] of [['fog', { density: 1, cells: CELLS }], ['caustics', { intensity: 1, cells: CELLS }]]) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      const L = createLayer('effect', { effectId: id }); L.params = params; L.seed = 7;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const c = mk(S, S); eng.renderFrame(c.getContext('2d'), doc, 3, {});
      const d = c.getContext('2d').getImageData(0, 0, S, S).data;
      const A = (x, y) => d[(y * S + x) * 4 + 3];
      let worst = 0;
      for (let y = 8; y < S - 8; y += 5) {
        for (let b = 1; b < CELLS; b++) {
          const x = b * CW;
          const jump = Math.abs(A(x, y) - (A(x - 1, y) + A(x + 1, y)) / 2);
          if (jump > worst) worst = jump;
        }
      }
      out[id] = worst;
    }
    return out;
  });
  expect(r.fog, '안개 경계 튐').toBeLessThanOrEqual(2);
  expect(r.caustics, '코스틱 경계 튐').toBeLessThanOrEqual(2);
});

test('밝은 배경용: 끔은 예전과 픽셀 동일, 테두리·진하게는 밝은 배경과 차이가 2배 이상', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 160;
    const eng = createRenderEngine({ createCanvas: mk, effects });
    const ids = [...effects.values()].filter((e) => e.lightBg).map((e) => e.id);
    function render(id, params) {
      const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
      doc.meta.background = { type: 'solid', color: '#eceef2' };
      const L = createLayer('effect', { effectId: id }); L.params = params; L.seed = 11;
      doc.layers[L.id] = L; doc.order.push(L.id);
      const c = mk(S, S); const g = c.getContext('2d');
      eng.renderFrame(g, doc, 4, {});
      return g.getImageData(0, 0, S, S).data;
    }
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const bgL = 0.299 * 0xec + 0.587 * 0xee + 0.114 * 0xf2;
    const contrast = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(lum(d, i) - bgL); return s / (d.length / 4); };
    const out = {};
    for (const id of ids) {
      const none = render(id, {});
      const off = render(id, { lightBg: 'off' });
      let same = true; for (let i = 0; i < none.length; i++) if (none[i] !== off[i]) { same = false; break; }
      out[id] = { same, off: contrast(off), outline: contrast(render(id, { lightBg: 'outline' })), dark: contrast(render(id, { lightBg: 'dark' })) };
    }
    return out;
  });
  expect(Object.keys(r).length, '밝은 배경용을 가진 효과 수').toBeGreaterThanOrEqual(11);
  for (const [id, v] of Object.entries(r)) {
    expect(v.same, `${id} 끔 = 예전`).toBe(true);
    // 이 프레임에 거의 안 그린 효과(파문 등)나 원래도 밝은 배경에서 잘 보이는 효과(풀숲)는 2배 비교 생략
    if (v.off < 0.05 || v.off > 15) continue;
    expect(v.outline, `${id} 테두리 대비`).toBeGreaterThan(v.off * 2);
    expect(v.dark, `${id} 진하게 대비`).toBeGreaterThan(v.off * 2);
  }
});

test('시험용 효과·모션(test-*)은 앱 레지스트리에 없다(테스트 표시 없는 페이지)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const r = await page.evaluate(async () => {
    const { getAllEffects } = await import('/src/effects/registry.js');
    const { getAllMotions } = await import('/src/motions/registry.js');
    return {
      fx: getAllEffects().filter((e) => e.id.startsWith('test-')).length,
      mo: getAllMotions().filter((m) => m.id.startsWith('test-')).length,
    };
  });
  await ctx.close();
  expect(r.fx).toBe(0);
  expect(r.mo).toBe(0);
});
