// P4 보완: 스키마 일치·좌표·효과 계약·캐시
import { test, expect } from '@playwright/test';

test.describe('P4 보완', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── 1. 스키마 일치: 텍스트 layer.color ─────────────────────────────────
  test('[스키마] 텍스트: layer.color=#ff0000 → 빨간 픽셀 존재', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 1;

      const layer = createLayer('text');
      // 스키마: layer.color (layer.style 금지)
      layer.text    = 'A';
      layer.color   = '#ff0000';
      layer.size    = 60;
      layer.font    = 'sans-serif';
      layer.transform.x.value = 50;
      layer.transform.y.value = 50;
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv = createCanvas(100, 100);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 100, 100).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 200 && d[i+1] < 50 && d[i+2] < 50 && d[i+3] > 0) return 'ok';
      }
      return '빨간 픽셀 없음';
    });
    expect(ok).toBe('ok');
  });

  // ── 2. 스키마 일치: 도형 layer.shape.kind + fill 문자열 ─────────────────
  test('[스키마] 도형: kind=rect, fill=#ff0000 → 빨간 픽셀 존재', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 1;

      const layer = createLayer('shape');
      // 스키마: layer.shape.kind (type 금지), fill은 색 문자열
      layer.shape = { kind: 'rect', w: 40, h: 40, fill: '#ff0000', stroke: null };
      layer.transform.x.value = 50;
      layer.transform.y.value = 50;
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv = createCanvas(100, 100);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 100, 100).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 200 && d[i+1] < 50 && d[i+2] < 50 && d[i+3] > 0) return 'ok';
      }
      return '빨간 픽셀 없음';
    });
    expect(ok).toBe('ok');
  });

  // ── 3. 스키마 일치: 도형 ellipse → 모서리 투명 ─────────────────────────
  test('[스키마] 도형: kind=ellipse → 모서리 픽셀 투명', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 1;

      const layer = createLayer('shape');
      layer.shape = { kind: 'ellipse', w: 80, h: 80, fill: '#0000ff', stroke: null };
      layer.transform.x.value = 50;
      layer.transform.y.value = 50;
      layer.anchor = { x: 0.5, y: 0.5 };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv = createCanvas(100, 100);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 100, 100).data;
      // 중앙(50,50): 파란색이어야 함
      const cx = (50 * 100 + 50) * 4;
      if (d[cx+2] < 200) return `중앙 픽셀 파랑 없음: b=${d[cx+2]}`;
      // 모서리(2,2): 투명이어야 함
      const corner = (2 * 100 + 2) * 4;
      if (d[corner+3] > 10) return `모서리 픽셀 불투명: alpha=${d[corner+3]}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 4. 좌표: x=30, y=30 도형 → (30,30) 빨간 픽셀, (80,80) 투명 ─────────
  // 구좌표계(w/2+x 오프셋): rect가 (80,80) 중심 → (70~90) 범위
  // 신좌표계(x가 캔버스 직접): rect가 (30,30) 중심 → (20~40) 범위
  test('[좌표] x=30, y=30 rect(20×20) → (30,30) 빨강, (80,80) 투명', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 1;

      const layer = createLayer('shape');
      layer.shape = { kind: 'rect', w: 20, h: 20, fill: '#ff0000', stroke: null };
      layer.anchor = { x: 0.5, y: 0.5 };
      layer.transform.x.value = 30;  // 앵커가 캔버스 (30,30)에 위치
      layer.transform.y.value = 30;
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv = createCanvas(100, 100);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 100, 100).data;
      // (30,30): rect 중심 → 빨강 (r>200, g<50, b<50)
      const inside = (30 * 100 + 30) * 4;
      if (d[inside] < 200 || d[inside+1] > 50 || d[inside+2] > 50 || d[inside+3] < 200)
        return `(30,30) 빨강 없음: rgba=(${d[inside]},${d[inside+1]},${d[inside+2]},${d[inside+3]})`;
      // (80,80): 신좌표계 rect 범위(20~40) 밖 → 투명
      const outside = (80 * 100 + 80) * 4;
      if (d[outside+3] > 10)
        return `(80,80) 투명하지 않음: alpha=${d[outside+3]}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 5. 그룹: visible=false 자식 → 픽셀 없음 ────────────────────────────
  test('[그룹] visible=false 자식 → 렌더 안 됨', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 1;

      const child = createLayer('shape');
      child.shape = { kind: 'rect', w: 80, h: 80, fill: '#ff0000', stroke: null };
      child.transform.x.value = 50;
      child.transform.y.value = 50;
      child.visible = false;  // 숨김 (schema 필드: visible, hidden 아님)
      child.parentId = null; // 임시

      const group = createLayer('group');
      group.childOrder = [child.id];
      group.transform.x.value = 50;
      group.transform.y.value = 50;

      child.parentId = group.id;
      doc.layers[child.id] = child;
      doc.layers[group.id] = group;
      doc.order.push(group.id);

      const cv = createCanvas(100, 100);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 100, 100).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i+3] > 0) return `픽셀이 그려짐: i=${i} alpha=${d[i+3]}`;
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 6. 그룹: opacity=0.5 → 픽셀 알파 127~128 ───────────────────────────
  test('[그룹] opacity=0.5 → 픽셀 알파 127~128', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 1;

      const child = createLayer('shape');
      child.shape = { kind: 'rect', w: 60, h: 60, fill: '#ffffff', stroke: null };
      child.transform.x.value = 50;
      child.transform.y.value = 50;
      child.parentId = null;

      const group = createLayer('group');
      group.childOrder = [child.id];
      group.opacity = 0.5;
      group.transform.x.value = 50;
      group.transform.y.value = 50;

      child.parentId = group.id;
      doc.layers[child.id] = child;
      doc.layers[group.id] = group;
      doc.order.push(group.id);

      const cv = createCanvas(100, 100);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 100, 100).data;
      const centerIdx = (50 * 100 + 50) * 4;
      const alpha = d[centerIdx + 3];
      if (alpha < 120 || alpha > 135) return `중앙 알파=${alpha}, 예상 127~128`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 7. 이펙트 계약: render 함수 존재 ────────────────────────────────────
  test('[이펙트] test-dots.render 함수 존재', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const effect = await import('/src/effects/test-dots.js');
      const e = effect.default ?? effect.testDotsEffect;
      if (!e) return '이펙트 없음';
      if (typeof e.render !== 'function') return `render 없음: keys=${Object.keys(e).join(',')}`;
      if (!e.id) return 'id 없음';
      if (!e.name) return 'name 없음';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 8. 이펙트: 루프 f=0 == f=frameCount (phase = f/frameCount) ──────────
  test('[이펙트] f=0과 f=frameCount 픽셀 완전 일치 (루프 보장)', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const effectModule = await import('/src/effects/test-dots.js');
      const effect = effectModule.default ?? effectModule.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[effect.id, effect]]);
      const engine = createRenderEngine({ createCanvas, effects });

      const doc = createDoc();
      doc.meta.width = 100; doc.meta.height = 100; doc.meta.frameCount = 24;

      const layer = createLayer('effect');
      layer.effectId = effect.id;
      layer.seed     = 99;
      layer.params   = { count: 50, phase: true };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv0 = createCanvas(100, 100);
      const cvN = createCanvas(100, 100);
      engine.renderFrame(cv0.getContext('2d'), doc, 0);
      engine.renderFrame(cvN.getContext('2d'), doc, 24);

      const d0 = cv0.getContext('2d').getImageData(0, 0, 100, 100).data;
      const dN = cvN.getContext('2d').getImageData(0, 0, 100, 100).data;
      for (let i = 0; i < d0.length; i++) {
        if (d0[i] !== dN[i]) return `루프 불일치 i=${i}: f0=${d0[i]} fN=${dN[i]}`;
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 9. 엔진 API: stats(), prepare() 존재 ────────────────────────────────
  test('[엔진] stats()와 prepare() 존재', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });
      if (typeof engine.stats !== 'function') return 'stats 없음';
      if (typeof engine.prepare !== 'function') return 'prepare 없음';
      const s = engine.stats();
      const required = ['renders', 'cacheHits', 'cacheMisses', 'adjustRuns', 'lastMs'];
      for (const k of required) {
        if (!(k in s)) return `stats에 ${k} 없음`;
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 10. 엔진 API: 배경색 doc.meta.background에서 읽기 ───────────────────
  test('[엔진] doc.meta.background.color → 배경 픽셀', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const engine = createRenderEngine({ createCanvas });

      const doc = createDoc();
      doc.meta.width = 50; doc.meta.height = 50; doc.meta.frameCount = 1;
      doc.meta.background = { type: 'solid', color: '#0000ff' };

      const cv = createCanvas(50, 50);
      engine.renderFrame(cv.getContext('2d'), doc, 0);

      const d = cv.getContext('2d').getImageData(0, 0, 50, 50).data;
      const center = (25 * 50 + 25) * 4;
      if (d[center+2] < 200) return `배경 파랑 없음: b=${d[center+2]}`;
      if (d[center] > 10 || d[center+1] > 10) return `배경이 파랑이 아님: rgb=(${d[center]},${d[center+1]},${d[center+2]})`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 11. 결정론: 같은 엔진 2회 + 새 엔진 1회 → 세 결과 동일 ─────────────
  test('[결정론] 같은 엔진 2회 + 새 엔진 1회 → 세 결과 동일', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const effectModule = await import('/src/effects/test-dots.js');
      const effect = effectModule.default ?? effectModule.testDotsEffect;

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[effect.id, effect]]);

      const doc = createDoc();
      doc.meta.width = 80; doc.meta.height = 80; doc.meta.frameCount = 24;

      const layer = createLayer('effect');
      layer.effectId = effect.id;
      layer.seed     = 7;
      layer.params   = { count: 80, phase: true };
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      function render(eng) {
        const cv = createCanvas(80, 80);
        eng.renderFrame(cv.getContext('2d'), doc, 11);
        return cv.getContext('2d').getImageData(0, 0, 80, 80).data;
      }

      const engA = createRenderEngine({ createCanvas, effects });
      const engB = createRenderEngine({ createCanvas, effects });
      const d1 = render(engA);
      const d2 = render(engA);  // 같은 엔진 두 번째
      const d3 = render(engB);  // 새 엔진

      for (let i = 0; i < d1.length; i++) {
        if (d1[i] !== d2[i]) return `엔진A 1회 vs 2회 불일치 i=${i}: ${d1[i]} vs ${d2[i]}`;
        if (d1[i] !== d3[i]) return `엔진A vs 엔진B 불일치 i=${i}: ${d1[i]} vs ${d3[i]}`;
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 12. LUT 보정: adjust-reference.json과 비교 ─────────────────────────
  test('[LUT] levels/hsl/curves 기준값과 일치', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { applyLevels, applyHSL, applyCurves } = await import('/src/core/render/adjust.js');
      const ref = await fetch('/tests/fixtures/adjust-reference.json').then(r => r.json());

      for (const tc of ref.cases) {
        const data = new Uint8ClampedArray(tc.input);
        if (tc.levels) applyLevels(data, tc.levels);
        if (tc.hsl)    applyHSL(data, tc.hsl);
        if (tc.curves) applyCurves(data, tc.curves);
        for (let i = 0; i < tc.expected.length; i++) {
          if (data[i] !== tc.expected[i]) {
            return `${tc.name} channel[${i}]: got=${data[i]} expected=${tc.expected[i]}`;
          }
        }
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 13. 캐시: 두 번째 renderFrame → stats.adjustRuns=0 ──────────────────
  test('[캐시] 두 번째 renderFrame → stats.adjustRuns=0', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const fakeBitmap = new OffscreenCanvas(50, 50);
      const fbc = fakeBitmap.getContext('2d');
      fbc.fillStyle = 'white'; fbc.fillRect(0, 0, 50, 50);
      const assets = { getBitmap: (id) => id === 'bmp1' ? fakeBitmap : null, getAnimFrames: () => null };

      const engine = createRenderEngine({ createCanvas, assets });

      const doc = createDoc();
      doc.meta.width = 80; doc.meta.height = 80; doc.meta.frameCount = 1;

      const layer = createLayer('image');
      layer.assetId = 'bmp1';
      layer.adjust  = { brightness: 80 };
      layer.transform.x.value = 40;
      layer.transform.y.value = 40;
      doc.layers[layer.id] = layer;
      doc.order.push(layer.id);

      const cv = createCanvas(80, 80);
      engine.renderFrame(cv.getContext('2d'), doc, 0);
      const s1 = engine.stats();
      cv.getContext('2d').clearRect(0, 0, 80, 80);
      engine.renderFrame(cv.getContext('2d'), doc, 0);
      const s2 = engine.stats();

      if (s1.adjustRuns < 1) return `1회 adjustRuns=${s1.adjustRuns}, 예상 >=1`;
      if (s2.adjustRuns !== 0) return `2회 adjustRuns=${s2.adjustRuns}, 예상 0 (캐시 히트)`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 14. 마스크: alpha 모드 ──────────────────────────────────────────────
  test('[마스크] alpha 모드: 흰 영역 알파 유지, 검은 영역 투명', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { renderMask } = await import('/src/core/render/mask.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const pool = { borrow: createCanvas, release: () => {} };

      // 소스: 왼쪽 절반 흰색(알파255), 오른쪽 절반 투명(알파0)
      const src = createCanvas(100, 50);
      const sc  = src.getContext('2d');
      sc.fillStyle = 'white'; sc.fillRect(0, 0, 50, 50);
      // 오른쪽은 clearRect로 투명 유지

      const fakeLayer = { id: 'ms' };
      const mc = renderMask(fakeLayer, 0, 100, 50,
        { mode: 'alpha', invert: false, feather: 0 },
        pool, (ctx) => ctx.drawImage(src, 0, 0));

      const d = mc.getContext('2d').getImageData(0, 0, 100, 50).data;
      const leftAlpha  = d[(25 * 100 + 10) * 4 + 3];  // 왼쪽
      const rightAlpha = d[(25 * 100 + 80) * 4 + 3];   // 오른쪽
      if (leftAlpha < 200) return `왼쪽 알파=${leftAlpha}, 예상 >200`;
      if (rightAlpha > 10) return `오른쪽 알파=${rightAlpha}, 예상 <10`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 15. 마스크: luma 모드 ───────────────────────────────────────────────
  test('[마스크] luma 모드: 흰색→불투명, 검정→투명', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { renderMask } = await import('/src/core/render/mask.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const pool = { borrow: createCanvas, release: () => {} };

      const src = createCanvas(2, 1);
      const sc  = src.getContext('2d');
      sc.fillStyle = 'white'; sc.fillRect(0, 0, 1, 1);  // 왼쪽 픽셀 흰색
      // 오른쪽 픽셀 검정(0,0,0,255)
      sc.fillStyle = 'rgba(0,0,0,1)'; sc.fillRect(1, 0, 1, 1);

      const fakeLayer = { id: 'ms2' };
      const mc = renderMask(fakeLayer, 0, 2, 1,
        { mode: 'luma', invert: false, feather: 0 },
        pool, (ctx) => ctx.drawImage(src, 0, 0));

      const d = mc.getContext('2d').getImageData(0, 0, 2, 1).data;
      const leftAlpha  = d[3];   // 픽셀 0 알파
      const rightAlpha = d[7];   // 픽셀 1 알파

      if (leftAlpha < 200) return `흰 픽셀 알파=${leftAlpha}, 예상 >200`;
      if (rightAlpha > 10) return `검정 픽셀 알파=${rightAlpha}, 예상 <10`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 16. 마스크: invert ──────────────────────────────────────────────────
  test('[마스크] invert: 흰색→투명, 검정→불투명', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { renderMask } = await import('/src/core/render/mask.js');

      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const pool = { borrow: createCanvas, release: () => {} };

      const src = createCanvas(2, 1);
      const sc  = src.getContext('2d');
      sc.fillStyle = 'white'; sc.fillRect(0, 0, 1, 1);
      sc.fillStyle = 'rgba(0,0,0,1)'; sc.fillRect(1, 0, 1, 1);

      const fakeLayer = { id: 'ms3' };
      const mc = renderMask(fakeLayer, 0, 2, 1,
        { mode: 'luma', invert: true, feather: 0 },
        pool, (ctx) => ctx.drawImage(src, 0, 0));

      const d = mc.getContext('2d').getImageData(0, 0, 2, 1).data;
      const leftAlpha  = d[3];  // 원래 흰색 → invert → 투명
      const rightAlpha = d[7];  // 원래 검정 → invert → 불투명

      if (leftAlpha > 10)  return `흰→반전 알파=${leftAlpha}, 예상 <10`;
      if (rightAlpha < 200) return `검→반전 알파=${rightAlpha}, 예상 >200`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });
});
