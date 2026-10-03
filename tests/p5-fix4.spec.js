// P5 보완4 테스트
// 항목 1: 고배율 view 렌더 시 작업 캔버스 최대 크기 <= view 크기 + 여유
// 항목 2: view 렌더 == 전체 렌더 잘라 낸 것 (이펙트+마스크 포함, 오차 2)
import { test, expect } from '@playwright/test';

test.describe('P5 보완4 — 작업 캔버스 크기 제한 + view 렌더 정확도', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── 항목 1: pool 최대 캔버스 크기 ─────────────────────────────────────────
  test('[보완4] scope=full 이펙트+마스크 고배율: pool 최대 크기 <= view+여유', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');
      const testDots = (await import('/src/effects/test-dots.js')).default;

      const W = 300, H = 300, F = 0;
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[testDots.id, testDots]]);

      const doc = createDoc({ width: W, height: H, fps: 12, frameCount: 24 });

      const bg = createLayer('shape');
      bg.shape = { kind: 'rect', w: W, h: H, fill: '#222222', stroke: null };
      bg.transform.x.value = W / 2; bg.transform.y.value = H / 2;
      doc.layers[bg.id] = bg; doc.order.push(bg.id);

      const maskSrc = createLayer('shape');
      maskSrc.shape = { kind: 'ellipse', w: 60, h: 60, fill: '#ffffff', stroke: null };
      maskSrc.transform.x.value = 150; maskSrc.transform.y.value = 150;
      doc.layers[maskSrc.id] = maskSrc; doc.order.push(maskSrc.id);

      const eff = createLayer('effect');
      eff.effectId = testDots.id;
      eff.seed = 1;
      eff.scope = 'full';
      eff.params = { count: 200, phase: false };
      eff.mask = { sourceId: maskSrc.id, mode: 'alpha' };
      doc.layers[eff.id] = eff; doc.order.push(eff.id);

      const engine = createRenderEngine({ createCanvas, effects });

      // scale=8(배율 800%), view는 doc의 50×50 픽셀만
      const scale = 8;
      const view  = { x: 100, y: 100, w: 50, h: 50 };
      const vW    = Math.ceil(view.w * scale);   // 400
      const vH    = Math.ceil(view.h * scale);   // 400
      const docFullW = Math.round(W * scale);    // 2400 — 이 크기가 나오면 안 됨

      const cv = new OffscreenCanvas(vW, vH);
      engine.renderFrame(cv.getContext('2d'), doc, F, { scale, view });

      const s = engine.stats();
      return { maxBorrowW: s.maxBorrowW, maxBorrowH: s.maxBorrowH, vW, vH, docFullW };
    });

    console.log(
      `[보완4] pool 최대 크기: ${result.maxBorrowW}×${result.maxBorrowH}` +
      ` | view: ${result.vW}×${result.vH} | 문서 전체: ${result.docFullW}×${result.docFullW}`
    );

    // 작업 캔버스 최대 크기 <= view 크기 + 여유(외곽선·블러 반경)
    const margin = 200;
    expect(result.maxBorrowW, `maxBorrowW(${result.maxBorrowW}) <= view(${result.vW})+margin`).toBeLessThanOrEqual(result.vW + margin);
    expect(result.maxBorrowH, `maxBorrowH(${result.maxBorrowH}) <= view(${result.vH})+margin`).toBeLessThanOrEqual(result.vH + margin);
    // 전체 문서 크기(2400)는 나오지 않아야 함
    expect(result.maxBorrowW).toBeLessThan(result.docFullW);
  });

  // ── 항목 2: view 렌더 정확도 ──────────────────────────────────────────────
  test('[보완4] scope=full 이펙트+마스크 view 렌더 == 전체 렌더 크롭 (오차 2)', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');
      const testDots = (await import('/src/effects/test-dots.js')).default;

      const W = 300, H = 300, F = 5;
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[testDots.id, testDots]]);

      const doc = createDoc({ width: W, height: H, fps: 12, frameCount: 24 });

      const bg = createLayer('shape');
      bg.shape = { kind: 'rect', w: W, h: H, fill: '#222222', stroke: null };
      bg.transform.x.value = W / 2; bg.transform.y.value = H / 2;
      doc.layers[bg.id] = bg; doc.order.push(bg.id);

      const maskSrc = createLayer('shape');
      maskSrc.shape = { kind: 'ellipse', w: 80, h: 80, fill: '#ffffff', stroke: null };
      maskSrc.transform.x.value = 150; maskSrc.transform.y.value = 150;
      doc.layers[maskSrc.id] = maskSrc; doc.order.push(maskSrc.id);

      const eff = createLayer('effect');
      eff.effectId = testDots.id;
      eff.seed = 42;
      eff.scope = 'full';
      eff.params = { count: 500, phase: false };
      eff.mask = { sourceId: maskSrc.id, mode: 'alpha' };
      doc.layers[eff.id] = eff; doc.order.push(eff.id);

      const engine = createRenderEngine({ createCanvas, effects });

      const cases = [
        { view: { x: 0,   y: 0,   w: 150, h: 150 }, scale: 1 },
        { view: { x: 50,  y: 30,  w: 150, h: 150 }, scale: 2 },
        { view: { x: 100, y: 100, w: 100, h: 100 }, scale: 2 },
      ];
      const out = [];

      for (const { view, scale } of cases) {
        const fullW = Math.round(W * scale), fullH = Math.round(H * scale);
        const fullCv = createCanvas(fullW, fullH);
        engine.renderFrame(fullCv.getContext('2d'), doc, F, { scale });

        const vW = Math.ceil(view.w * scale), vH = Math.ceil(view.h * scale);
        const vCv = createCanvas(vW, vH);
        engine.renderFrame(vCv.getContext('2d'), doc, F, { scale, view });

        const fullData = fullCv.getContext('2d').getImageData(0, 0, fullW, fullH);
        const vData    = vCv.getContext('2d').getImageData(0, 0, vW, vH);

        const cx0 = Math.round(view.x * scale), cy0 = Math.round(view.y * scale);
        let maxDiff = 0, diffCount = 0;
        for (let y = 0; y < vH; y++) {
          for (let x = 0; x < vW; x++) {
            for (let c = 0; c < 4; c++) {
              const vi = (y * vW + x) * 4 + c;
              const fi = ((cy0 + y) * fullW + (cx0 + x)) * 4 + c;
              const d  = Math.abs(vData.data[vi] - fullData.data[fi]);
              if (d > maxDiff) maxDiff = d;
              if (d > 2) diffCount++;
            }
          }
        }
        out.push({ view, scale, maxDiff, diffCount });
      }
      return out;
    });

    for (const r of results) {
      expect(
        r.maxDiff,
        `view(${r.view.x},${r.view.y}) scale=${r.scale}: maxDiff=${r.maxDiff} diffCount=${r.diffCount}`
      ).toBeLessThanOrEqual(2);
    }
  });

  // ── 항목 3: 이미지 레이어(blur+마스크) view 렌더 정확도 ──────────────────
  test('[보완4] 이미지 blur+마스크 view 렌더 == 전체 렌더 크롭', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');

      const W = 200, H = 200, F = 0;
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);

      const doc = createDoc({ width: W, height: H, fps: 12, frameCount: 1 });

      const bg = createLayer('shape');
      bg.shape = { kind: 'rect', w: W, h: H, fill: '#113355', stroke: null };
      bg.transform.x.value = W / 2; bg.transform.y.value = H / 2;
      doc.layers[bg.id] = bg; doc.order.push(bg.id);

      const maskSrc = createLayer('shape');
      maskSrc.shape = { kind: 'rect', w: 60, h: 60, fill: '#ffffff', stroke: null };
      maskSrc.transform.x.value = 100; maskSrc.transform.y.value = 100;
      doc.layers[maskSrc.id] = maskSrc; doc.order.push(maskSrc.id);

      // 60×60 빨간 비트맵
      const bm = new OffscreenCanvas(60, 60);
      bm.getContext('2d').fillStyle = '#ff4444';
      bm.getContext('2d').fillRect(0, 0, 60, 60);

      const img = createLayer('image');
      img.assetId = 'red';
      img.adjust = { blur: 3 };
      img.mask   = { sourceId: maskSrc.id, mode: 'alpha' };
      img.transform.x.value = 100;
      img.transform.y.value = 100;
      doc.layers[img.id] = img; doc.order.push(img.id);

      const assets = { getBitmap: (id) => id === 'red' ? bm : null, getAnimFrames: () => null };
      const engine = createRenderEngine({ createCanvas, assets });

      const scale = 2;
      const view  = { x: 30, y: 30, w: 120, h: 120 };
      const fullW = W * scale, fullH = H * scale;
      const vW = Math.ceil(view.w * scale), vH = Math.ceil(view.h * scale);

      const fullCv = createCanvas(fullW, fullH);
      engine.renderFrame(fullCv.getContext('2d'), doc, F, { scale });

      const vCv = createCanvas(vW, vH);
      engine.renderFrame(vCv.getContext('2d'), doc, F, { scale, view });

      const fullData = fullCv.getContext('2d').getImageData(0, 0, fullW, fullH);
      const vData    = vCv.getContext('2d').getImageData(0, 0, vW, vH);

      const cx0 = Math.round(view.x * scale), cy0 = Math.round(view.y * scale);
      let maxDiff = 0;
      for (let y = 0; y < vH; y++) {
        for (let x = 0; x < vW; x++) {
          for (let c = 0; c < 4; c++) {
            const vi = (y * vW + x) * 4 + c;
            const fi = ((cy0 + y) * fullW + (cx0 + x)) * 4 + c;
            const d  = Math.abs(vData.data[vi] - fullData.data[fi]);
            if (d > maxDiff) maxDiff = d;
          }
        }
      }
      return { maxDiff };
    });

    // blur는 view 경계에서 약간의 차이 허용 (가장자리 픽셀 컨텍스트 부족)
    expect(result.maxDiff, `이미지 blur+마스크 maxDiff`).toBeLessThanOrEqual(30);
  });
});
