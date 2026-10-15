// R1 추가 — 배율(scale 1·2·0.5)과 view(문서 일부만 그리기)에서 도형 위치가
// 문서 단위로 같은지 확인한다. 합성은 문서 단위로 하고 renderScale 은 맨 마지막에
// 한 번만 곱하므로, 어떤 배율·view 에서도 같은 자리에 와야 한다.
import { test, expect } from '@playwright/test';

// 불투명(alpha>128) 픽셀 bbox 의 '중심'을 문서 단위로. 외곽선·흐림의 대칭 확장에
// 흔들리지 않도록 min/max 가 아니라 중심을 비교한다.
const CENTER_FN = `
  (cx, w, h, sc, offX, offY) => {
    const d = cx.getImageData(0, 0, w, h).data;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 128) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { cx: ((minX + maxX) / 2) / sc + (offX || 0), cy: ((minY + maxY) / 2) / sc + (offY || 0) };
  }`;

// 한 문서를 scale 1·2·0.5(전체) + scale 1(view)로 그려 중심을 모은다.
// buildDoc: (H) => doc, assets/effects 는 선택.
async function centers(page, buildStr, view) {
  return await page.evaluate(async ({ CF, BUILD, VIEW }) => {
    const center = eval(CF);
    const H = await import('/tests/e1-helpers.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const build = eval('(' + BUILD + ')');
    const out = {};
    for (const sc of [1, 2, 0.5]) {
      const { doc, assets } = await build(H);
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects });
      const w = Math.round(doc.meta.width * sc), h = Math.round(doc.meta.height * sc);
      const c = H.createCanvas(w, h);
      const cx = c.getContext('2d', { willReadFrequently: true });
      eng.renderFrame(cx, doc, 0, { scale: sc });
      out['s' + sc] = center(cx, w, h, sc, 0, 0);
    }
    // view: 문서 일부만 그린다(원점은 view.x/y). 중심에 offset 을 더해 문서 좌표로 환산.
    {
      const { doc, assets } = await build(H);
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects });
      const c = H.createCanvas(VIEW.w, VIEW.h);
      const cx = c.getContext('2d', { willReadFrequently: true });
      eng.renderFrame(cx, doc, 0, { scale: 1, view: VIEW });
      out.view = center(cx, VIEW.w, VIEW.h, 1, VIEW.x, VIEW.y);
    }
    return out;
  }, { CF: CENTER_FN, BUILD: buildStr, VIEW: view });
}

function expectConsistent(r, tol = 2) {
  expect(r.s1).not.toBeNull();
  const base = r.s1;
  for (const k of ['s2', 's0.5', 'view']) {
    expect(r[k], k).not.toBeNull();
    expect(Math.abs(r[k].cx - base.cx), k + '.cx').toBeLessThanOrEqual(tol);
    expect(Math.abs(r[k].cy - base.cy), k + '.cy').toBeLessThanOrEqual(tol);
  }
}

test.describe('R1 추가 — 배율·view 위치 일관성', () => {
  test('그룹 기준점 이동', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 100, height: 100, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 12, h: 12, fill: '#ff0000', stroke: null };
      s.transform.x.value = 70; s.transform.y.value = 60;
      const g = createLayer('group', { name: 'g', childOrder: [s.id] });
      g.transform.x.value = 50; g.transform.y.value = 50;
      s.parentId = g.id; doc.layers[s.id] = s; doc.layers[g.id] = g; doc.order.push(g.id);
      return { doc };
    }`;
    expectConsistent(await centers(page, build, { x: 40, y: 30, w: 60, h: 60 }));
  });

  test('회전·축척된 그룹 안 자식', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 120, height: 120, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 10, h: 10, fill: '#ff0000', stroke: null };
      s.transform.x.value = 80; s.transform.y.value = 60;
      const g = createLayer('group', { name: 'g', childOrder: [s.id] });
      g.transform.x.value = 60; g.transform.y.value = 60;
      g.transform.scale.value = 1.4; g.transform.rotation.value = 30;
      s.parentId = g.id; doc.layers[s.id] = s; doc.layers[g.id] = g; doc.order.push(g.id);
      return { doc };
    }`;
    expectConsistent(await centers(page, build, { x: 30, y: 30, w: 70, h: 70 }));
  });

  test('그룹 안 그룹(중첩)', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 120, height: 120, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 10, h: 10, fill: '#ff0000', stroke: null };
      s.transform.x.value = 80; s.transform.y.value = 70;
      const g2 = createLayer('group', { name: 'g2', childOrder: [s.id] });
      g2.transform.x.value = 50; g2.transform.y.value = 50; g2.transform.scale.value = 1.2;
      const g1 = createLayer('group', { name: 'g1', childOrder: [g2.id] });
      g1.transform.x.value = 30; g1.transform.y.value = 30;
      s.parentId = g2.id; g2.parentId = g1.id;
      doc.layers[s.id] = s; doc.layers[g2.id] = g2; doc.layers[g1.id] = g1; doc.order.push(g1.id);
      return { doc };
    }`;
    expectConsistent(await centers(page, build, { x: 40, y: 40, w: 70, h: 70 }));
  });

  test('카메라 x·y·줌', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 100, height: 100, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 12, h: 12, fill: '#ff0000', stroke: null };
      s.transform.x.value = 60; s.transform.y.value = 55;
      doc.layers[s.id] = s; doc.order.push(s.id);
      doc.camera.x.value = 20; doc.camera.y.value = 10; doc.camera.zoom.value = 1.5;
      return { doc };
    }`;
    expectConsistent(await centers(page, build, { x: 30, y: 30, w: 60, h: 60 }));
  });

  test('그룹 안 이미지(흐림 경로)', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 120, height: 120, fps: 10, frameCount: 2 });
      const id = new ImageData(16, 12);
      for (let i = 0; i < id.data.length; i += 4) { id.data[i] = 255; id.data[i+3] = 255; }
      const bmp = await createImageBitmap(id);
      const im = createLayer('image', { name: 'im', assetId: 'A' });
      im.transform.x.value = 75; im.transform.y.value = 60;
      im.adjust = { blur: 2 };
      const g = createLayer('group', { name: 'g', childOrder: [im.id] });
      g.transform.x.value = 45; g.transform.y.value = 45;
      im.parentId = g.id; doc.layers[im.id] = im; doc.layers[g.id] = g; doc.order.push(g.id);
      return { doc, assets: { getBitmap: () => bmp, getAnimFrames: () => null } };
    }`;
    expectConsistent(await centers(page, build, { x: 30, y: 30, w: 80, h: 70 }), 3);
  });

  test('그룹 안 마스크', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 120, height: 120, fps: 10, frameCount: 2 });
      const mask = createLayer('shape', { name: 'm' });
      mask.shape = { kind: 'ellipse', w: 30, h: 30, fill: '#ffffff', stroke: null };
      mask.transform.x.value = 75; mask.transform.y.value = 60;  // 마스크 소스는 visible 유지(renderMask 가 직접 그림)
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 40, h: 40, fill: '#ff0000', stroke: null };
      s.transform.x.value = 75; s.transform.y.value = 60;
      s.mask = { sourceId: mask.id, mode: 'alpha' };
      const g = createLayer('group', { name: 'g', childOrder: [s.id] });
      g.transform.x.value = 45; g.transform.y.value = 45;
      s.parentId = g.id;
      doc.layers[mask.id] = mask; doc.layers[s.id] = s; doc.layers[g.id] = g; doc.order.push(g.id);
      return { doc };
    }`;
    expectConsistent(await centers(page, build, { x: 40, y: 30, w: 70, h: 70 }), 3);
  });

  test('이펙트 box 범위', async ({ page }) => {
    await page.goto('/tests/e1-helpers.js');
    const build = `async (H) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 140, height: 140, fps: 10, frameCount: 4 });
      const fx = createLayer('effect', { name: 'fx', effectId: 'test-dots' });
      fx.scope = 'box';
      fx.box = { w: 40, h: 40 };
      fx.seed = 7;
      fx.params = { count: 400, radius: 3, color: '#ff0000', phase: false };
      fx.transform.x.value = 80; fx.transform.y.value = 70;
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return { doc };
    }`;
    expectConsistent(await centers(page, build, { x: 40, y: 30, w: 90, h: 90 }), 3);
  });
});
