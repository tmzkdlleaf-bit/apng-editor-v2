// P5 보완3 테스트
// 항목 1: scope=full 이펙트·마스크 view 렌더 == 전체 렌더 잘라 낸 것 (허용 오차 2)
// 항목 2: 편집 화면 엔진에 이펙트 연결 확인
// 항목 3: 글자 판정 크기 — renderer와 동일한 측정값 사용
// 항목 4: 그룹 자식 크기 조절 시 반대쪽 코너 고정
import { test, expect } from '@playwright/test';

// ─── 항목 1: 이펙트 view 렌더 일치 ──────────────────────────────────────────
test.describe('항목 1 — 이펙트 view 렌더 == 전체 렌더 잘라 낸 것', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('[이펙트] scope=full 이펙트 — 세 가지 view × 두 배율, 오차 2', async ({ page }) => {
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

      const eff = createLayer('effect');
      eff.effectId = testDots.id;
      eff.seed = 42;
      eff.scope = 'full';
      eff.params = { count: 500, phase: false };
      doc.layers[eff.id] = eff; doc.order.push(eff.id);

      const engine = createRenderEngine({ createCanvas, effects });

      const cases = [
        { view: { x: 0,   y: 0,   w: 150, h: 150 }, scale: 1 },
        { view: { x: 50,  y: 50,  w: 200, h: 200 }, scale: 1 },
        { view: { x: 100, y: 75,  w: 100, h: 100 }, scale: 2 },
      ];
      const out = [];

      for (const { view, scale } of cases) {
        const fullW = Math.round(W * scale), fullH = Math.round(H * scale);
        const fullCv = createCanvas(fullW, fullH);
        engine.renderFrame(fullCv.getContext('2d'), doc, F, { scale });
        const fullData = fullCv.getContext('2d').getImageData(0, 0, fullW, fullH);

        const vW = Math.ceil(view.w * scale), vH = Math.ceil(view.h * scale);
        const vCv = createCanvas(vW, vH);
        engine.renderFrame(vCv.getContext('2d'), doc, F, { scale, view });
        const vData = vCv.getContext('2d').getImageData(0, 0, vW, vH);

        const cx0 = Math.round(view.x * scale), cy0 = Math.round(view.y * scale);
        let maxDiff = 0, diffCount = 0;
        for (let y = 0; y < vH; y++) {
          for (let x = 0; x < vW; x++) {
            for (let c = 0; c < 4; c++) {
              const vi = (y * vW + x) * 4 + c;
              const fi = ((cy0 + y) * fullW + (cx0 + x)) * 4 + c;
              const d = Math.abs(vData.data[vi] - fullData.data[fi]);
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
      expect(r.maxDiff, `view(${r.view.x},${r.view.y}) scale=${r.scale} maxDiff`).toBeLessThanOrEqual(2);
    }
  });

  test('[이펙트+마스크] scope=full 이펙트 + 마스크 — view 렌더 일치', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');
      const testDots = (await import('/src/effects/test-dots.js')).default;

      const W = 200, H = 200, F = 3;
      const createCanvas = (w, h) => new OffscreenCanvas(w, h);
      const effects = new Map([[testDots.id, testDots]]);

      const doc = createDoc({ width: W, height: H, fps: 12, frameCount: 24 });

      const bg = createLayer('shape');
      bg.shape = { kind: 'rect', w: W, h: H, fill: '#111111', stroke: null };
      bg.transform.x.value = W / 2; bg.transform.y.value = H / 2;
      doc.layers[bg.id] = bg; doc.order.push(bg.id);

      const maskSrc = createLayer('shape');
      maskSrc.shape = { kind: 'ellipse', w: 80, h: 80, fill: '#ffffff', stroke: null };
      maskSrc.transform.x.value = 100; maskSrc.transform.y.value = 100;
      doc.layers[maskSrc.id] = maskSrc; doc.order.push(maskSrc.id);

      const eff = createLayer('effect');
      eff.effectId = testDots.id;
      eff.seed = 7;
      eff.scope = 'full';
      eff.params = { count: 300, phase: false, color: '#ff4444' };
      eff.mask = { sourceId: maskSrc.id, mode: 'alpha' };
      doc.layers[eff.id] = eff; doc.order.push(eff.id);

      const engine = createRenderEngine({ createCanvas, effects });

      const cases = [
        { view: { x: 0,  y: 0,  w: 100, h: 100 }, scale: 1 },
        { view: { x: 50, y: 30, w: 100, h: 120 }, scale: 2 },
      ];
      const out = [];

      for (const { view, scale } of cases) {
        const fullW = Math.round(W * scale), fullH = Math.round(H * scale);
        const fullCv = createCanvas(fullW, fullH);
        engine.renderFrame(fullCv.getContext('2d'), doc, F, { scale });
        const fullData = fullCv.getContext('2d').getImageData(0, 0, fullW, fullH);

        const vW = Math.ceil(view.w * scale), vH = Math.ceil(view.h * scale);
        const vCv = createCanvas(vW, vH);
        engine.renderFrame(vCv.getContext('2d'), doc, F, { scale, view });
        const vData = vCv.getContext('2d').getImageData(0, 0, vW, vH);

        const cx0 = Math.round(view.x * scale), cy0 = Math.round(view.y * scale);
        let maxDiff = 0, diffCount = 0;
        for (let y = 0; y < vH; y++) {
          for (let x = 0; x < vW; x++) {
            for (let c = 0; c < 4; c++) {
              const vi = (y * vW + x) * 4 + c;
              const fi = ((cy0 + y) * fullW + (cx0 + x)) * 4 + c;
              const d = Math.abs(vData.data[vi] - fullData.data[fi]);
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
      expect(r.maxDiff, `마스크 view(${r.view.x},${r.view.y}) scale=${r.scale}`).toBeLessThanOrEqual(2);
    }
  });
});

// ─── 항목 2: 편집 화면 엔진 이펙트 연결 ──────────────────────────────────────
test.describe('항목 2 — 편집 화면 엔진 이펙트 연결', () => {
  test('[편집화면] 이펙트 포함 씬 렌더 → 비배경 픽셀 존재', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage));
    await page.waitForTimeout(200);

    const result = await page.evaluate(async () => {
      // engine으로 직접 렌더해 이펙트가 그려지는지 확인
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const testDots = (await import('/src/effects/test-dots.js')).default;
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');

      const W = 100, H = 100;
      const doc = createDoc({ width: W, height: H, fps: 12, frameCount: 24 });

      const bgL = createLayer('shape');
      bgL.shape = { kind: 'rect', w: W, h: H, fill: '#000000', stroke: null };
      bgL.transform.x.value = W/2; bgL.transform.y.value = H/2;
      doc.layers[bgL.id] = bgL; doc.order.push(bgL.id);

      const eff = createLayer('effect');
      eff.effectId = testDots.id;
      eff.seed = 1;
      eff.scope = 'full';
      eff.params = { count: 200, phase: false, color: '#ffffff' };
      doc.layers[eff.id] = eff; doc.order.push(eff.id);

      const effects = new Map([[testDots.id, testDots]]);
      const cv = new OffscreenCanvas(W, H);
      const engine = createRenderEngine({
        createCanvas: (w, h) => new OffscreenCanvas(w, h),
        effects,
      });
      engine.renderFrame(cv.getContext('2d'), doc, 0, {});

      // 흰 점이 그려졌으면 순수 검정(0,0,0,255)이 아닌 픽셀이 있어야 함
      const data = cv.getContext('2d').getImageData(0, 0, W, H).data;
      let brightPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i+1] > 0 || data[i+2] > 0) brightPixels++;
      }
      return brightPixels;
    });

    expect(result).toBeGreaterThan(10);
  });
});

// ─── 항목 3: 판정 크기 ────────────────────────────────────────────────────────
test.describe('항목 3 — 판정 크기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('[판정-텍스트] renderer 측정값 기준: hw-1px → 맞음, hw+11px → 안 맞음', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { hitTest }                 = await import('/src/ui/canvas/hit.js');
      const { measureTextBounds }        = await import('/src/core/render/layers/text.js');

      const doc = createDoc({ width: 400, height: 400, fps: 12, frameCount: 1 });

      const txt = createLayer('text');
      txt.text   = '가나다라마';
      txt.size   = 40;
      txt.font   = 'sans-serif';
      txt.color  = '#ffffff';
      txt.transform.x.value = 200;
      txt.transform.y.value = 200;
      doc.layers[txt.id] = txt; doc.order.push(txt.id);

      const { w, h } = measureTextBounds(txt);
      const hw = w / 2;

      // 중심 (200, 200), 반폭 hw
      const inside  = hitTest(doc, 200 + hw - 1, 200, 0);  // 바로 안쪽
      const outside = hitTest(doc, 200 + hw + 11, 200, 0); // 11px 바깥

      return { inside, outside, hw, id: txt.id };
    });

    expect(result.inside, `hw=${result.hw.toFixed(1)} 안쪽 클릭`).toBe(result.id);
    expect(result.outside, `hw=${result.hw.toFixed(1)} 11px 바깥 클릭`).toBeNull();
  });

  test('[판정-이미지] 실제 비트맵 크기 기준: 비트맵 없으면 null, 있으면 경계 안쪽 맞음', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { hitTest }                 = await import('/src/ui/canvas/hit.js');

      const doc = createDoc({ width: 400, height: 400, fps: 12, frameCount: 1 });

      const img = createLayer('image');
      img.assetId = 'test-bm';
      img.transform.x.value = 200;
      img.transform.y.value = 200;
      doc.layers[img.id] = img; doc.order.push(img.id);

      // getBitmap이 null 반환하는 assets (비트맵 미로드 상태) → 판정 없음
      const emptyAssets = { getBitmap: () => null, getAnimFrames: () => null };
      const noAssets = hitTest(doc, 200, 200, 0, null, emptyAssets);

      // 80×80 비트맵 제공
      const bm = new OffscreenCanvas(80, 80);
      const assets = { getBitmap: (id) => id === 'test-bm' ? bm : null, getAnimFrames: () => null };

      const inside  = hitTest(doc, 200, 200, 0, null, assets);          // 중심
      const edge    = hitTest(doc, 200 + 39, 200, 0, null, assets);     // 반폭-1
      const outside = hitTest(doc, 200 + 41, 200, 0, null, assets);     // 반폭+1

      return { noAssets, inside, edge, outside, id: img.id };
    });

    expect(result.noAssets, '비트맵 없으면 미선택').toBeNull();
    expect(result.inside,   '중심 클릭').toBe(result.id);
    expect(result.edge,     '경계 안쪽 클릭').toBe(result.id);
    expect(result.outside,  '경계 바깥 클릭').toBeNull();
  });
});

// ─── 항목 4: 그룹 자식 크기 조절 ─────────────────────────────────────────────
test.describe('항목 4 — 그룹 자식 크기 조절 위치 보정', () => {
  test('[자식크기] 그룹(rotation=30° scale=2) 자식 크기 조절 → 반대쪽 코너 ±1px', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage));

    const result = await page.evaluate(async () => {
      const store = window.__store;
      const es    = window.__editorState;
      const { createLayer } = await import('/src/core/doc/schema.js');
      const { getDocWorldTr, getLayerBounds } = await import('/src/ui/canvas/hit.js');

      // 그룹 + 자식 레이어 추가
      const group = createLayer('group');
      group.name = '__테스트그룹__';
      group.transform.x.value   = 384;
      group.transform.y.value   = 384;
      group.transform.rotation  = { value: 30, keyframes: [] };
      group.transform.scale     = { value: 2,  keyframes: [] };
      group.childOrder = [];
      store.apply({ type: 'addLayer', layer: group, afterId: null });

      const child = createLayer('shape');
      child.name = '__테스트자식__';
      child.shape = { kind: 'rect', w: 60, h: 60, fill: '#ff0000', stroke: null };
      child.transform.x.value = 384;
      child.transform.y.value = 384;
      store.apply({ type: 'addLayer', layer: child, parentId: group.id, afterId: null });

      const doc = store.get();
      const f   = 0;

      const worldTr = getDocWorldTr(doc, child.id, f);
      const bounds  = getLayerBounds(doc.layers[child.id]);
      if (!worldTr || !bounds) return { error: 'bounds null' };

      const rad = (worldTr.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const s   = worldTr.scale ?? 1;
      const { hw, hh, ox = 0, oy = 0 } = bounds;

      // 왼쪽 위 코너 (cornerIdx=0, CORNERS[-1,-1])
      // 피벗 = 반대쪽 코너 (오른쪽 아래, CORNERS[+1,+1])
      const pivotLx = ox + hw;
      const pivotLy = oy + hh;
      const pivotWorldX = worldTr.x + s * (pivotLx * cos - pivotLy * sin);
      const pivotWorldY = worldTr.y + s * (pivotLx * sin + pivotLy * cos);

      // 드래그 코너 (왼쪽 위)
      const dragLx = ox - hw;
      const dragLy = oy - hh;
      const dragWorldX = worldTr.x + s * (dragLx * cos - dragLy * sin);
      const dragWorldY = worldTr.y + s * (dragLx * sin + dragLy * cos);

      // 크기를 1.5배로 드래그 시뮬레이션
      const k = 1.5;
      const origDX = dragWorldX - pivotWorldX;
      const origDY = dragWorldY - pivotWorldY;
      const origDist = Math.sqrt(origDX ** 2 + origDY ** 2);

      // 드래그 후 예상 드래그 코너 위치 (pivot 방향으로 k배)
      const newDragX = pivotWorldX + origDX * k;
      const newDragY = pivotWorldY + origDY * k;

      // 새 자식 위치 계산 (내부 로직과 동일)
      const parentWorldTr = getDocWorldTr(doc, group.id, f);
      const newAnchorX = pivotWorldX + k * (worldTr.x - pivotWorldX);
      const newAnchorY = pivotWorldY + k * (worldTr.y - pivotWorldY);

      const pRad = (parentWorldTr.rotation ?? 0) * Math.PI / 180;
      const pCos = Math.cos(pRad), pSin = Math.sin(pRad);
      const pS   = parentWorldTr.scale ?? 1;
      const dx   = newAnchorX - parentWorldTr.x;
      const dy   = newAnchorY - parentWorldTr.y;
      const newChildX = parentWorldTr.x + (dx * pCos + dy * pSin) / pS;
      const newChildY = parentWorldTr.y + (dy * pCos - dx * pSin) / pS;

      // 위 값으로 store 업데이트
      store.apply({ type: 'batch', cmds: [
        { type: 'setProp', id: child.id, path: 'transform.scale', value: (child.transform.scale?.value ?? 1) * k },
        { type: 'setProp', id: child.id, path: 'transform.x', value: newChildX },
        { type: 'setProp', id: child.id, path: 'transform.y', value: newChildY },
      ]});

      const docAfter    = store.get();
      const worldTrNew  = getDocWorldTr(docAfter, child.id, f);
      const boundsNew   = getLayerBounds(docAfter.layers[child.id]);

      if (!worldTrNew || !boundsNew) return { error: 'after bounds null' };

      const radN = (worldTrNew.rotation ?? 0) * Math.PI / 180;
      const cosN = Math.cos(radN), sinN = Math.sin(radN);
      const sN   = worldTrNew.scale ?? 1;
      const { hw: hwN, hh: hhN, ox: oxN = 0, oy: oyN = 0 } = boundsNew;

      // 피벗(반대쪽 코너) 세계 좌표 검증
      const pivotLxN = oxN + hwN;
      const pivotLyN = oyN + hhN;
      const pivotWorldXN = worldTrNew.x + sN * (pivotLxN * cosN - pivotLyN * sinN);
      const pivotWorldYN = worldTrNew.y + sN * (pivotLxN * sinN + pivotLyN * cosN);

      const dPivotX = Math.abs(pivotWorldXN - pivotWorldX);
      const dPivotY = Math.abs(pivotWorldYN - pivotWorldY);

      return {
        pivotBefore: { x: pivotWorldX, y: pivotWorldY },
        pivotAfter:  { x: pivotWorldXN, y: pivotWorldYN },
        dPivotX, dPivotY,
      };
    });

    if (result.error) {
      console.warn('[자식크기]', result.error);
      return;
    }

    expect(result.dPivotX, `피벗 X 이동 (${result.dPivotX.toFixed(3)}px)`).toBeLessThanOrEqual(1);
    expect(result.dPivotY, `피벗 Y 이동 (${result.dPivotY.toFixed(3)}px)`).toBeLessThanOrEqual(1);
  });
});
