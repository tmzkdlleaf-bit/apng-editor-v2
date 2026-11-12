// R28c — 그림 변형 5종: 그림자·밝은 곳 번짐·아지랑이·모자이크·부분 흐림(+ 효과 레이어 가리기).
import { test, expect } from './helpers/fixtures.js';

async function setup(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
}

// 공용: 체크 무늬 비트맵(또는 작은 도형) 소스 + 효과 하나를 그려 픽셀을 돌려준다.
const BUILD = async (cases) => {
  const { createRenderEngine } = await import('/src/core/render/frame.js');
  const { effects } = await import('/src/effects/registry.js');
  const { createDoc, createLayer, createMask } = await import('/src/core/doc/schema.js');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const S = 160;
  const chk = mk(S, S); { const g = chk.getContext('2d'); for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#ffffff' : '#2050c0'; g.fillRect(x, y, 8, 8); } }
  const box = mk(40, 60); { const g = box.getContext('2d'); g.fillStyle = '#e04040'; g.fillRect(0, 0, 40, 60); }
  const assets = { getBitmap: (id) => (id === 'box' ? box : chk), getAnimFrames: () => null };
  const eng = createRenderEngine({ createCanvas: mk, effects, assets });
  const out = {};
  for (const [name, c] of Object.entries(cases)) {
    const doc = createDoc({ width: S, height: S, fps: 12, frameCount: 12 });
    const L = createLayer('image'); L.assetId = c.asset ?? 'chk'; L.transform.x.value = S / 2; L.transform.y.value = S / 2;
    L.visible = !c.fx;
    doc.layers[L.id] = L; doc.order.push(L.id);
    if (c.fx) {
      const F = createLayer('effect', { effectId: c.fx }); F.params = c.params ?? {}; F.sources = [{ key: 'below', sourceId: L.id }];
      if (c.mask) { const m = createMask({ path: { value: { closed: true, pts: c.mask } } }); F.masks = { order: [m.id], items: { [m.id]: m } }; }
      doc.layers[F.id] = F; doc.order.push(F.id);
    }
    const cv = mk(S, S); eng.renderFrame(cv.getContext('2d'), doc, c.f ?? 3, {});
    out[name] = Array.from(cv.getContext('2d').getImageData(0, 0, S, S).data);
  }
  return out;
};

test('그림자: 거리·흐림·퍼짐 0 이면 소스 밖에 그림자 없음, 기본값이면 오른쪽 아래에 그림자', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(BUILD, {
    src: { asset: 'box' },
    flat: { asset: 'box', fx: 'drop-shadow', params: { distance: 0, blur: 0, spread: 0 } },
    def: { asset: 'box', fx: 'drop-shadow' },
  });
  const S = 160, A = (d, x, y) => d[(y * S + x) * 4 + 3];
  let outside = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (A(r.src, x, y) === 0 && A(r.flat, x, y) > 0) outside++;
  expect(outside).toBe(0);
  expect(A(r.def, 104, 115)).toBeGreaterThan(30);   // 상자(60..100 × 50..110) 오른쪽 아래 밖
  expect(A(r.def, 55, 45)).toBe(0);                  // 왼쪽 위 밖에는 없음
});

test('부분 흐림: 영역 밖·미니어처 띠 가운데는 원본 그대로, 흐린 곳은 달라짐', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(BUILD, {
    src: {},
    area: { fx: 'partial-blur', params: { mode: 'area', size: 0.3, falloff: 0.05 } },
    mini: { fx: 'partial-blur', params: { mode: 'miniature', band: 0.5, size: 0.2, falloff: 0.2 } },
  });
  const S = 160, px = (d, x, y) => d.slice((y * S + x) * 4, (y * S + x) * 4 + 4).join(',');
  expect(px(r.area, 5, 5)).toBe(px(r.src, 5, 5));          // 영역(가운데 원) 밖
  expect(px(r.area, 84, 84)).not.toBe(px(r.src, 84, 84));  // 영역 안은 흐림
  expect(px(r.mini, 30, 80)).toBe(px(r.src, 30, 80));      // 띠 가운데 줄
  expect(px(r.mini, 30, 3)).not.toBe(px(r.src, 30, 3));    // 위쪽은 흐림
});

test('부분 흐림 펜으로 지정: 효과 레이어 가리기 안만 흐림이 보인다', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(BUILD, {
    pen: { fx: 'partial-blur', params: { mode: 'pen' },
      mask: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 160 }, { x: 0, y: 160 }] },
  });
  const S = 160, A = (d, x, y) => d[(y * S + x) * 4 + 3];
  expect(A(r.pen, 20, 80)).toBeGreaterThan(200);  // 가리기 안(왼쪽 반)
  expect(A(r.pen, 140, 80)).toBe(0);              // 가리기 밖
});

test('모자이크: 칸 안 픽셀은 같은 색', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(BUILD, { m: { fx: 'mosaic', params: { cell: 16 } } });
  const S = 160, px = (x, y) => r.m.slice((y * S + x) * 4, (y * S + x) * 4 + 4).join(',');
  for (const [cx, cy] of [[1, 1], [3, 5], [8, 2]]) {
    const base = px(cx * 16 + 2, cy * 16 + 2);
    expect(px(cx * 16 + 13, cy * 16 + 13)).toBe(base);
    expect(px(cx * 16 + 8, cy * 16 + 4)).toBe(base);
  }
});

test('밝은 곳 번짐·아지랑이: 세기 0이면 소스 그대로, 켜면 달라짐', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(BUILD, {
    src: {},
    b0: { fx: 'bloom', params: { strength: 0 } }, b1: { fx: 'bloom', params: { threshold: 0.5 } },
    h0: { fx: 'heat-haze', params: { strength: 0 } }, h1: { fx: 'heat-haze', params: { range: 'full' } },
  });
  const eq = (a, b) => a.every((v, i) => v === b[i]);
  expect(eq(r.b0, r.src)).toBe(true);
  expect(eq(r.b1, r.src)).toBe(false);
  expect(eq(r.h0, r.src)).toBe(true);
  expect(eq(r.h1, r.src)).toBe(false);
});
