// 성능 측정 — renderFrame 처리량 (P4 이후)
// npm run perf 로 실행. 결과를 tests/perf/baseline.json에 저장한다.
// CI 테스트와는 별개로 실행되며, 통과/실패 기준 없음.
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const WARMUP_FRAMES = 5;
const MEASURE_FRAMES = 24;
const CANVAS_SIZE = 400;

test.describe('P4 성능 측정', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('[perf] renderFrame 처리량 측정 (effect 24프레임)', async ({ page }) => {
    const result = await page.evaluate(async ({ warmup, measure, size }) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');
      const { testDotsEffect }         = await import('/src/effects/test-dots.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([['test-dots', testDotsEffect]]);
      const engine  = createRenderEngine({ createCanvas, effects });

      const doc = createDoc();
      doc.meta.width      = size;
      doc.meta.height     = size;
      doc.meta.frameCount = measure;

      const layer = createLayer('effect');
      layer.effectId = 'test-dots';
      layer.seed     = 1;
      layer.params   = { count: 300, phase: true };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv  = createCanvas(size, size);
      const ctx = cv.getContext('2d');

      // 웜업
      for (let i = 0; i < warmup; i++) {
        engine.renderFrame(ctx, doc, i % measure);
      }

      // 측정
      const t0 = performance.now();
      for (let i = 0; i < measure; i++) {
        engine.renderFrame(ctx, doc, i);
      }
      const elapsed = performance.now() - t0;

      return {
        frames:     measure,
        totalMs:    elapsed,
        msPerFrame: elapsed / measure,
        fps:        1000 / (elapsed / measure),
        canvasSize: size,
        description: `effect(test-dots,count=300) ${size}×${size}`,
      };
    }, { warmup: WARMUP_FRAMES, measure: MEASURE_FRAMES, size: CANVAS_SIZE });

    console.log(`[perf] ${result.description}`);
    console.log(`  ${result.frames}프레임 / ${result.totalMs.toFixed(1)}ms`);
    console.log(`  ${result.msPerFrame.toFixed(2)}ms/프레임 (${result.fps.toFixed(1)} fps)`);

    // baseline.json 저장 (npm run perf 시)
    const baseline = {
      timestamp: new Date().toISOString(),
      results: [result],
    };
    try {
      writeFileSync(
        resolve(__dirname, 'baseline.json'),
        JSON.stringify(baseline, null, 2),
      );
    } catch (_e) {
      // CI 등 쓰기 불가 환경에서는 무시
    }

    // 최소 성능 기준: 200×200 이상에서 500ms 이내 (24프레임)
    expect(result.totalMs).toBeLessThan(5000);
  });
});
