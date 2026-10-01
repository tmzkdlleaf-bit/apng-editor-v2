// 성능 측정 — renderFrame 처리량 (P4 보완 이후)
// npm run perf 로 실행. 결과를 tests/perf/baseline.json에 저장.
// 기준값보다 20% 이상 느리면 실패.
import { test, expect } from '@playwright/test';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const BASELINE_PATH = resolve(__dirname, 'baseline.json');

test.describe('P4 성능 측정', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('[perf] 768×768 24프레임 × 3바퀴 (이미지10 글자3 effect3)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');
      const mod = await import('/src/effects/test-dots.js');
      const testDots = mod.default ?? mod.testDotsEffect;

      const W = 768, H = 768, FRAMES = 24, RUNS = 3;
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[testDots.id, testDots]]);

      // 코드로 만든 비트맵 10개 (5개는 보정 포함)
      const bitmaps = [];
      for (let i = 0; i < 10; i++) {
        const bm = new OffscreenCanvas(200, 200);
        const bc = bm.getContext('2d');
        bc.fillStyle = `hsl(${i * 36}, 70%, 50%)`;
        bc.fillRect(0, 0, 200, 200);
        bc.fillStyle = `hsl(${(i + 5) * 36}, 50%, 80%)`;
        bc.fillRect(20, 20, 160, 160);
        bitmaps.push(bm);
      }

      const assets = {
        getBitmap:     (id) => bitmaps[parseInt(id, 10)] ?? null,
        getAnimFrames: () => null,
      };

      const engine = createRenderEngine({ createCanvas, effects, assets });
      const doc    = createDoc();
      doc.meta.width      = W;
      doc.meta.height     = H;
      doc.meta.frameCount = FRAMES;

      // 이미지 10개 (5개는 brightness 보정)
      for (let i = 0; i < 10; i++) {
        const lyr = createLayer('image');
        lyr.assetId = String(i);
        lyr.transform.x.value = 80 + (i % 5) * 120;
        lyr.transform.y.value = 80 + Math.floor(i / 5) * 120;
        if (i < 5) lyr.adjust = { brightness: 80 };
        doc.layers[lyr.id] = lyr;
        doc.order.push(lyr.id);
      }

      // 글자 3개
      const textColors = ['#ffffff', '#ffcc00', '#00ccff'];
      for (let i = 0; i < 3; i++) {
        const lyr = createLayer('text');
        lyr.text   = '가나다라마';
        lyr.color  = textColors[i];
        lyr.size   = 40;
        lyr.font   = 'sans-serif';
        lyr.transform.x.value = W / 2;
        lyr.transform.y.value = 80 + i * 80;
        doc.layers[lyr.id] = lyr;
        doc.order.push(lyr.id);
      }

      // test-dots 3개 (seed 다름)
      for (let i = 0; i < 3; i++) {
        const lyr = createLayer('effect');
        lyr.effectId = testDots.id;
        lyr.seed     = i + 1;
        lyr.params   = { count: 200, phase: true };
        doc.layers[lyr.id] = lyr;
        doc.order.push(lyr.id);
      }

      const cv  = createCanvas(W, H);
      const ctx = cv.getContext('2d');

      // 웜업 1바퀴
      for (let i = 0; i < FRAMES; i++) engine.renderFrame(ctx, doc, i);

      // 측정 RUNS 바퀴
      const times = [];
      for (let run = 0; run < RUNS; run++) {
        const t0 = performance.now();
        for (let i = 0; i < FRAMES; i++) engine.renderFrame(ctx, doc, i);
        times.push(performance.now() - t0);
      }

      const avgTotal = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTotal = Math.max(...times);
      const s = engine.stats();

      return {
        frames:      FRAMES,
        runs:        RUNS,
        times,
        avgTotalMs:  avgTotal,
        maxTotalMs:  maxTotal,
        avgPerFrame: avgTotal / FRAMES,
        maxPerFrame: maxTotal / FRAMES,
        cacheHitRate: s.cacheHits / Math.max(1, s.cacheHits + s.cacheMisses),
        canvasSize:  `${W}×${H}`,
        layers:      '이미지10(보정5) + 글자3 + test-dots3',
        userAgent:   navigator.userAgent.slice(0, 80),
      };
    });

    const table = [
      `캔버스: ${result.canvasSize} / 구성: ${result.layers}`,
      `실행: ${result.runs}바퀴 × ${result.frames}프레임`,
      `평균 ${result.avgTotalMs.toFixed(1)}ms / ${result.avgPerFrame.toFixed(2)}ms/프레임`,
      `최대  ${result.maxTotalMs.toFixed(1)}ms / ${result.maxPerFrame.toFixed(2)}ms/프레임`,
      `캐시 적중률: ${(result.cacheHitRate * 100).toFixed(1)}%`,
      `기기: ${result.userAgent}`,
    ];
    console.log('\n[perf]\n' + table.join('\n'));

    if (!existsSync(BASELINE_PATH)) {
      const baseline = { timestamp: new Date().toISOString(), result };
      try { writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2)); } catch (_) {}
      console.log('[perf] 기준값 저장 완료');
    } else {
      let baseline;
      try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { baseline = null; }
      if (baseline?.result?.avgTotalMs) {
        const threshold = baseline.result.avgTotalMs * 1.2; // 20% 허용
        expect(result.avgTotalMs).toBeLessThan(threshold);
      }
    }

    expect(result.avgTotalMs).toBeLessThan(30000); // 절대 상한 30초
  });
});
