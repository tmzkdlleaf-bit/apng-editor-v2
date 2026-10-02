// P4 보완2: 이펙트 변환/마스크, 콘텐츠 캐시, draft 해상도
import { test, expect } from '@playwright/test';

test.describe('P4 보완2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── 1. 이펙트: x 변경 → 픽셀 달라짐 ─────────────────────────────────────
  test('[이펙트] x 변경 → 픽셀 달라짐 (변환 적용 확인)', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const mod = await import('/src/effects/test-dots.js');
      const effect = mod.default ?? mod.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[effect.id, effect]]);

      const W = 100, H = 100;

      function makeDoc(x) {
        const doc = createDoc();
        doc.meta.width = W; doc.meta.height = H; doc.meta.frameCount = 24;
        const layer = createLayer('effect');
        layer.effectId = effect.id;
        layer.seed  = 42;
        layer.params = { count: 600, phase: false };
        layer.transform.x.value = x;
        doc.layers[layer.id] = layer;
        doc.order.push(layer.id);
        return doc;
      }

      const engA = createRenderEngine({ createCanvas, effects });
      const engB = createRenderEngine({ createCanvas, effects });

      const cvA = createCanvas(W, H);
      const cvB = createCanvas(W, H);
      engA.renderFrame(cvA.getContext('2d'), makeDoc(0),  0);
      engB.renderFrame(cvB.getContext('2d'), makeDoc(30), 0);

      const dA = cvA.getContext('2d').getImageData(0, 0, W, H).data;
      const dB = cvB.getContext('2d').getImageData(0, 0, W, H).data;

      let diff = 0;
      for (let i = 0; i < dA.length; i++) {
        if (dA[i] !== dB[i]) diff++;
      }
      if (diff === 0) return 'x 변경해도 픽셀이 동일 (변환 미적용)';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 2. 이펙트: scope='full' 기본값 → 전체 화면 덮음 ──────────────────────
  test('[이펙트] scope=full 기본값 → 캔버스 전체에 픽셀 존재', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const mod = await import('/src/effects/test-dots.js');
      const effect = mod.default ?? mod.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[effect.id, effect]]);
      const engine = createRenderEngine({ createCanvas, effects });

      const W = 100, H = 100;
      const doc = createDoc();
      doc.meta.width = W; doc.meta.height = H; doc.meta.frameCount = 1;

      const layer = createLayer('effect');
      layer.effectId = effect.id;
      layer.seed  = 1;
      layer.params = { count: 2000, phase: false };
      // 기본값: scope='full', x=0, y=0
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv = createCanvas(W, H);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
      // 왼쪽 위, 오른쪽 아래 등 여러 구역에 픽셀 존재 확인
      const zones = [[10, 10], [80, 10], [10, 80], [80, 80], [50, 50]];
      let zoneHits = 0;
      for (const [cx, cy] of zones) {
        for (let dy = -10; dy <= 10; dy++) {
          for (let dx = -10; dx <= 10; dx++) {
            const i = ((cy + dy) * W + (cx + dx)) * 4;
            if (d[i + 3] > 0) { zoneHits++; break; }
          }
          if (zoneHits > 0) break;
        }
        if (zoneHits > 0) zoneHits++;
      }
      if (zoneHits < 3) return `전체 화면 미덮음: ${zoneHits}/5 구역에 픽셀`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 3. 이펙트: 마스크 적용 → 마스크 밖 투명 ─────────────────────────────
  test('[이펙트] 마스크 적용 → 마스크 밖 영역 투명', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const mod = await import('/src/effects/test-dots.js');
      const effect = mod.default ?? mod.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[effect.id, effect]]);
      const engine = createRenderEngine({ createCanvas, effects });

      const W = 100, H = 100;
      const doc = createDoc();
      doc.meta.width = W; doc.meta.height = H; doc.meta.frameCount = 1;

      // 마스크 소스: 왼쪽 절반 흰색 rect (doc.order에 포함하지 않음)
      const maskSrc = createLayer('shape');
      maskSrc.shape = { kind: 'rect', w: 50, h: H, fill: '#ffffff', stroke: null };
      maskSrc.transform.x.value = 25;  // 중심 x=25 → 0~50 영역
      maskSrc.transform.y.value = H / 2;
      doc.layers[maskSrc.id] = maskSrc;

      // 이펙트 레이어 (마스크 있음)
      const effLayer = createLayer('effect');
      effLayer.effectId = effect.id;
      effLayer.seed  = 77;
      effLayer.params = { count: 2000, phase: false };
      effLayer.mask  = { sourceId: maskSrc.id, mode: 'luma', invert: false, feather: 0 };
      doc.layers[effLayer.id] = effLayer;
      doc.order.push(effLayer.id);

      const cv = createCanvas(W, H);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, W, H).data;

      // 오른쪽 절반 (x=70~90) → 마스크 밖 → 완전 투명이어야
      let rightOpaque = 0;
      for (let y = 10; y < 90; y++) {
        for (let x = 70; x < 90; x++) {
          if (d[(y * W + x) * 4 + 3] > 10) rightOpaque++;
        }
      }
      if (rightOpaque > 0) return `마스크 밖 불투명 픽셀 ${rightOpaque}개`;

      // 왼쪽 절반 (x=5~40) → 마스크 안 → 일부 픽셀 존재해야
      let leftOpaque = 0;
      for (let y = 10; y < 90; y++) {
        for (let x = 5; x < 40; x++) {
          if (d[(y * W + x) * 4 + 3] > 10) leftOpaque++;
        }
      }
      if (leftOpaque === 0) return '마스크 안쪽에도 픽셀 없음 (이펙트가 그려지지 않음)';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 4. 캐시: 같은 f 두 번 → 두 번째 cacheHits 증가 ──────────────────────
  test('[캐시] 글자·도형: 같은 f 두 번 → 두 번째 cacheHits 증가', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 80; doc.meta.height = 80; doc.meta.frameCount = 1;

      // 도형 레이어 (정적, 마스크 없음)
      const shape = createLayer('shape');
      shape.shape = { kind: 'rect', w: 40, h: 40, fill: '#ff0000', stroke: null };
      shape.transform.x.value = 40;
      shape.transform.y.value = 40;
      doc.layers[shape.id] = shape;
      doc.order.push(shape.id);

      // 텍스트 레이어 (reveal 없음, 마스크 없음)
      const text = createLayer('text');
      text.text  = 'A';
      text.color = '#ffffff';
      text.size  = 24;
      text.transform.x.value = 40;
      text.transform.y.value = 40;
      doc.layers[text.id] = text;
      doc.order.push(text.id);

      const cv = createCanvas(80, 80);

      engine.renderFrame(cv.getContext('2d'), doc, 0);
      const s1 = engine.stats();

      engine.renderFrame(cv.getContext('2d'), doc, 0);
      const s2 = engine.stats();

      const hitsRender2 = s2.cacheHits - s1.cacheHits;
      if (hitsRender2 <= 0) return `두 번째 렌더 cacheHits=${hitsRender2}, 예상 >0 (1회=${s1.cacheHits})`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 5. 캐시: 마스크 없는 글자·도형 → 문서 크기 작업 캔버스 대여 0회 ──────
  test('[캐시] 마스크 없는 글자·도형: 문서 크기 캔버스 대여 0회', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const W = 100, H = 100;
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = W; doc.meta.height = H; doc.meta.frameCount = 1;

      const shape = createLayer('shape');
      shape.shape = { kind: 'rect', w: 40, h: 40, fill: '#ff0000', stroke: null };
      shape.transform.x.value = 50;
      shape.transform.y.value = 50;
      doc.layers[shape.id] = shape;
      doc.order.push(shape.id);

      const text = createLayer('text');
      text.text  = 'AB';
      text.color = '#ffffff';
      text.size  = 20;
      text.transform.x.value = 50;
      text.transform.y.value = 50;
      doc.layers[text.id] = text;
      doc.order.push(text.id);

      // 문서 크기 캔버스 대여 횟수 추적
      let docSizeBorrows = 0;
      const origBorrow = engine.pool.borrow.bind(engine.pool);
      engine.pool.borrow = (w, h) => {
        if (w === W && h === H) docSizeBorrows++;
        return origBorrow(w, h);
      };

      const cv = createCanvas(W, H);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      if (docSizeBorrows > 0) return `문서 크기(${W}×${H}) 캔버스 ${docSizeBorrows}회 대여됨`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 6. draft: 작업 캔버스 최대 크기 ≤ 문서 크기 절반 ─────────────────────
  test('[draft] 작업 캔버스 최대 크기 ≤ 문서 크기 절반', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const W = 100, H = 100;
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = W; doc.meta.height = H; doc.meta.frameCount = 1;

      // 그룹 레이어 → 작업 캔버스(렌더 해상도)를 빌림
      const child = createLayer('shape');
      child.shape = { kind: 'rect', w: 30, h: 30, fill: '#ff0000', stroke: null };
      child.transform.x.value = 50;
      child.transform.y.value = 50;

      const group = createLayer('group');
      group.childOrder = [child.id];
      group.transform.x.value = 50;
      group.transform.y.value = 50;
      child.parentId = group.id;
      doc.layers[child.id]  = child;
      doc.layers[group.id]  = group;
      doc.order.push(group.id);

      // 최대 대여 캔버스 크기 추적
      let maxW = 0, maxH = 0;
      const origBorrow = engine.pool.borrow.bind(engine.pool);
      engine.pool.borrow = (w, h) => {
        maxW = Math.max(maxW, w);
        maxH = Math.max(maxH, h);
        return origBorrow(w, h);
      };

      const cv = createCanvas(W, H);
      engine.renderFrame(cv.getContext('2d'), doc, 0, { quality: 'draft' });

      const halfW = W / 2;
      const halfH = H / 2;
      if (maxW > halfW) return `최대 캔버스 폭 ${maxW} > 절반(${halfW})`;
      if (maxH > halfH) return `최대 캔버스 높이 ${maxH} > 절반(${halfH})`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });
});
