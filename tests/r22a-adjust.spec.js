// R22a — 보정 레이어: 가리기·효과·불투명도. (그룹 시간은 R22b)
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

// 아래: 문서 전체 흰 도형. 위: 보정 레이어(brightness 50 = 어둡게). masks/fx/opacity 옵션.
function _setup() {
  return async ({ mask, fx, opacity, inGroup, withOutside, pattern }) => {
    const { createDoc, createLayer, createFx } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 10 });
    const below = createLayer('shape', { name: 'below' });
    below.shape = { kind: 'rect', w: 64, h: 64, fill: '#ffffff', stroke: null };
    below.transform.x = { value: 32 }; below.transform.y = { value: 32 };
    doc.layers[below.id] = below;

    // 효과(물결) 테스트용: 대비 있는 가운데 사각형(왜곡될 가장자리)
    let pat = null;
    if (pattern) {
      pat = createLayer('shape', { name: 'pat' });
      pat.shape = { kind: 'rect', w: 24, h: 24, fill: '#000000', stroke: null };
      pat.transform.x = { value: 32 }; pat.transform.y = { value: 32 };
      doc.layers[pat.id] = pat;
    }

    const adj = createLayer('adjust', { name: 'adj' });
    doc.layers[adj.id] = adj;
    adj.adjust = { brightness: 50 };
    if (opacity != null) adj.opacity = opacity;
    if (mask) adj.masks = { order: ['m1'], items: { m1: {
      id: 'm1', name: 'm', mode: 'add', invert: false,
      path: { value: { closed: true, pts: [{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 64 }, { x: 0, y: 64 }].map(p => ({ ...p, ix: 0, iy: 0, ox: 0, oy: 0 })) } },
      feather: { value: 0 }, expand: { value: 0 }, opacity: { value: 1 },
    } } };
    if (fx) {
      const fxId = 'fx1';
      adj.fx = { [fxId]: createFx('wave', { seed: 1 }) };
      adj.fxOrder = [fxId];
    }

    if (inGroup) {
      const g = createLayer('group', { name: 'g' });
      g.childOrder = [below.id, adj.id];
      below.parentId = g.id; adj.parentId = g.id;
      doc.layers[g.id] = g; doc.order.push(g.id);
      if (withOutside) {
        const out = createLayer('shape', { name: 'out' });
        out.shape = { kind: 'rect', w: 20, h: 64, fill: '#ffffff', stroke: null };
        out.transform.x = { value: 54 }; out.transform.y = { value: 32 }; // 오른쪽 끝
        doc.layers[out.id] = out; doc.order.push(out.id);
      }
    } else {
      doc.order.push(below.id);
      if (pat) doc.order.push(pat.id);
      doc.order.push(adj.id);
    }

    const eng = createRenderEngine({ createCanvas: mk, effects });
    const c = mk(64, 64); const ctx = c.getContext('2d', { willReadFrequently: true });
    eng.renderFrame(ctx, doc, 3, {});
    return { data: Array.from(ctx.getImageData(0, 0, 64, 64).data), belowId: below.id, adjId: adj.id };
  };
}
const RGB = (d, x, y) => [d[(y * 64 + x) * 4], d[(y * 64 + x) * 4 + 1], d[(y * 64 + x) * 4 + 2]];

test('보정 + 사각형 가리기: 안만 보정, 밖은 원본과 픽셀 동일', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const masked = await setup({ mask: true });
    const noAdj = await setup({ mask: true, opacity: 0 }); // opacity 0 = 보정 없음(아래만)
    return { masked: masked.data, noAdj: noAdj.data };
  }, _setup().toString());
  // 왼쪽(가리기 안): 어두워짐(<200), 오른쪽(밖): 원본 흰색 유지
  expect(RGB(r.masked, 16, 32)[0]).toBeLessThan(200);
  expect(RGB(r.masked, 48, 32)[0]).toBeGreaterThan(250);
  // 밖은 보정 없는 결과와 픽셀 동일(오른쪽 절반)
  let same = true;
  for (let y = 0; y < 64; y += 8) for (let x = 40; x < 64; x += 4) {
    const i = (y * 64 + x) * 4; if (r.masked[i] !== r.noAdj[i]) same = false;
  }
  expect(same).toBe(true);
});

test('보정 불투명도 0.5: 원본과 보정본의 중간(±2)', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const full = await setup({});                 // 완전 보정(127 근처)
    const half = await setup({ opacity: 0.5 });    // 중간
    const none = await setup({ opacity: 0 });      // 원본(255)
    return { full: full.data, half: half.data, none: none.data };
  }, _setup().toString());
  const f = RGB(r.full, 32, 32)[0], h = RGB(r.half, 32, 32)[0], n = RGB(r.none, 32, 32)[0];
  expect(Math.abs(h - (f + n) / 2)).toBeLessThan(2);
});

test('보정 + 효과 쌓기(물결): 아래 화면이 바뀐다', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const noFx = await setup({ pattern: true });
    const withFx = await setup({ pattern: true, fx: true });
    let diff = 0; for (let i = 0; i < noFx.data.length; i++) if (noFx.data[i] !== withFx.data[i]) diff++;
    return { diff };
  }, _setup().toString());
  expect(r.diff).toBeGreaterThan(200); // 효과로 픽셀이 눈에 띄게 달라짐
});

test('그룹 안 보정 레이어는 그룹 밖 레이어에 영향 없음', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const withAdj = await setup({ inGroup: true, withOutside: true });
    const noAdj = await setup({ inGroup: true, withOutside: true, opacity: 0 });
    // 바깥 레이어 영역(x≈58)은 보정 유무와 무관하게 같아야 한다
    let same = true;
    for (let y = 0; y < 64; y += 8) { const i = (y * 64 + 58) * 4; if (withAdj.data[i] !== noAdj.data[i]) same = false; }
    return { same, outPix: withAdj.data[(32 * 64 + 58) * 4] };
  }, _setup().toString());
  expect(r.outPix).toBeGreaterThan(250); // 바깥 흰색 그대로
  expect(r.same).toBe(true);
});

test('보정에 가리기·효과·불투명도 없으면 기존 전체 캔버스 경로(빠른 경로)로 동작', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const full = await setup({});
    const px = (d, x, y) => d[(y * 64 + x) * 4];
    // 전체가 고르게 어두워졌는지(빠른 경로: 전 캔버스 보정)
    return { c: px(full.data, 10, 10), c2: px(full.data, 50, 50) };
  }, _setup().toString());
  expect(r.c).toBeLessThan(200);
  expect(Math.abs(r.c - r.c2)).toBeLessThan(2); // 고르게
});
