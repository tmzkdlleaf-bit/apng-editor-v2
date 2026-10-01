import { test, expect } from '@playwright/test';

test.describe('P4 - 렌더 엔진', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  const CANVAS_FACTORY = `(w, h) => new OffscreenCanvas(w, h)`;

  // ── 1. 결정론 ───────────────────────────────────────────────────────────
  test('[P4] 같은 프레임을 두 번 그리면 픽셀이 동일하다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const mod = await import('/src/effects/test-dots.js');
      const testDots = mod.default ?? mod.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[testDots.id, testDots]]);
      const engine  = createRenderEngine({ createCanvas, effects });

      const doc = createDoc();
      doc.meta.width      = 200;
      doc.meta.height     = 200;
      doc.meta.frameCount = 24;

      const layer = createLayer('effect');
      layer.effectId = testDots.id;
      layer.seed     = 42;
      layer.params   = { count: 100, phase: true };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv1 = createCanvas(200, 200);
      const cv2 = createCanvas(200, 200);
      engine.renderFrame(cv1.getContext('2d'), doc, 7);
      engine.renderFrame(cv2.getContext('2d'), doc, 7);

      const d1 = cv1.getContext('2d').getImageData(0, 0, 200, 200).data;
      const d2 = cv2.getContext('2d').getImageData(0, 0, 200, 200).data;
      for (let i = 0; i < d1.length; i++) {
        if (d1[i] !== d2[i]) return `픽셀 불일치 i=${i}: ${d1[i]} vs ${d2[i]}`;
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 2. 루프 (f=0 == f=frameCount) ────────────────────────────────────────
  test('[P4] f=0과 f=frameCount의 렌더 결과가 같다 (루프 일치 문서)', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const mod = await import('/src/effects/test-dots.js');
      const testDots = mod.default ?? mod.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[testDots.id, testDots]]);
      const engine  = createRenderEngine({ createCanvas, effects });

      const doc = createDoc();
      doc.meta.width      = 200;
      doc.meta.height     = 200;
      doc.meta.frameCount = 24;

      const layer = createLayer('effect');
      layer.effectId = testDots.id;
      layer.seed     = 7;
      layer.params   = { count: 50, phase: false };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv0 = createCanvas(200, 200);
      const cvN = createCanvas(200, 200);
      engine.renderFrame(cv0.getContext('2d'), doc, 0);
      engine.renderFrame(cvN.getContext('2d'), doc, doc.meta.frameCount);

      const d0 = cv0.getContext('2d').getImageData(0, 0, 200, 200).data;
      const dN = cvN.getContext('2d').getImageData(0, 0, 200, 200).data;
      for (let i = 0; i < d0.length; i++) {
        if (d0[i] !== dN[i]) return `루프 불일치 i=${i}: ${d0[i]} vs ${dN[i]}`;
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 3. 캐시 — 2회 렌더 시 stats().adjustRuns 감소 ─────────────────────
  test('[P4] 두 번째 renderFrame에서 stats().adjustRuns가 0이다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);

      const fakeBitmap = new OffscreenCanvas(100, 100);
      const assets = {
        getBitmap:     (id) => id === 'bmp1' ? fakeBitmap : null,
        getAnimFrames: () => null,
      };
      const engine = createRenderEngine({ createCanvas, assets });

      const doc = createDoc();
      doc.meta.width      = 100;
      doc.meta.height     = 100;
      doc.meta.frameCount = 10;

      const layer = createLayer('image');
      layer.assetId = 'bmp1';
      layer.adjust  = { brightness: 80 };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv  = createCanvas(100, 100);
      const ctx = cv.getContext('2d');

      engine.renderFrame(ctx, doc, 0);
      const s1 = engine.stats();
      ctx.clearRect(0, 0, 100, 100);
      engine.renderFrame(ctx, doc, 0);
      const s2 = engine.stats();

      if (s1.adjustRuns < 1) return `1회차 adjustRuns=${s1.adjustRuns}, 예상 >=1`;
      if (s2.adjustRuns !== 0) return `2회차 adjustRuns=${s2.adjustRuns}, 예상 0 (캐시 히트)`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 4. LUT 보정 — 밝기 0 → 픽셀 전체 검정 ─────────────────────────────────
  test('[P4] brightness=0 보정 후 픽셀이 모두 검정(0)이다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { applyAdjust } = await import('/src/core/render/adjust.js');

      const canvas = new OffscreenCanvas(4, 4);
      const ctx    = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 4, 4);

      const id = ctx.getImageData(0, 0, 4, 4);
      applyAdjust(id, { brightness: 0 });
      ctx.putImageData(id, 0, 0);

      const d = ctx.getImageData(0, 0, 4, 4).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 0 || d[i+1] !== 0 || d[i+2] !== 0) {
          return `픽셀 ${i/4}: rgb=(${d[i]},${d[i+1]},${d[i+2]}), 예상 0`;
        }
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 5. 마스크 — 마스크 적용 시 마스크 밖 픽셀이 투명 ──────────────────────
  test('[P4] renderMask: luma 모드에서 흰 영역만 알파 유지', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { renderMask } = await import('/src/core/render/mask.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const pool = {
        borrow : createCanvas,
        release: () => {},
      };

      const srcCanvas = createCanvas(100, 100);
      const srcCtx    = srcCanvas.getContext('2d');
      srcCtx.fillStyle = 'white';
      srcCtx.fillRect(0, 0, 50, 100);

      const fakeLayer = { id: 'mask-src', type: 'shape' };

      const maskCanvas = renderMask(
        fakeLayer, 0, 100, 100,
        { mode: 'luma', invert: false, feather: 0 },
        pool,
        (maskCtx) => {
          maskCtx.drawImage(srcCanvas, 0, 0);
        }
      );

      const d = maskCanvas.getContext('2d').getImageData(0, 0, 100, 100).data;
      const leftAlpha  = d[(10 * 100 + 10) * 4 + 3];
      const rightAlpha = d[(10 * 100 + 80) * 4 + 3];

      if (leftAlpha < 200) return `왼쪽 알파=${leftAlpha}, 예상 >200`;
      if (rightAlpha > 10) return `오른쪽 알파=${rightAlpha}, 예상 <10`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });
});
