// F2-2·3 — 조정 레이어 + 도형 모음(path 도형 렌더 + 추가 메뉴 격자).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test.describe('F2-3 — 도형 모음', () => {
  test('[메뉴] 도형 격자에 9종 이상, 하트 추가 → path 도형 레이어', async ({ page }) => {
    await openApp(page);
    await page.click('.tl-layers-head .tl-add-btn');
    const n = await page.locator('.shape-grid .shape-grid-item').count();
    expect(n).toBeGreaterThanOrEqual(9);

    const before = await page.evaluate(() => window.__store.get().order.length);
    await page.click('.shape-grid .shape-grid-item[data-shape="heart"]');
    const r = await page.evaluate(() => {
      const doc = window.__store.get();
      const id = window.__editorState.get().selection[0];
      return { count: doc.order.length, kind: doc.layers[id]?.shape?.kind, hasPoints: Array.isArray(doc.layers[id]?.shape?.points) };
    });
    expect(r.count).toBe(before + 1);
    expect(r.kind).toBe('path');
    expect(r.hasPoints).toBe(true);
  });

  test('[렌더] path 도형(하트)이 실제로 그려진다(불투명 픽셀 존재)', async ({ page }) => {
    await openApp(page);
    const n = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { SHAPE_PACK } = await import('/src/ui/shapes-pack.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'shape' && (doc.layers[x].shape?.w ?? 999) <= 120);
      const heart = SHAPE_PACK.find((s) => s.key === 'heart').shape();
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      const d = JSON.parse(JSON.stringify(doc));
      for (const x of d.order) d.layers[x].visible = (x === id);
      d.layers[id].shape = heart;
      const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
      const data = cx.getImageData(0, 0, W, Hh).data;
      let op = 0; for (let k = 3; k < data.length; k += 4) if (data[k] >= 128) op++;
      return op;
    });
    expect(n).toBeGreaterThan(100);
  });
});

test.describe('F2-2 — 조정 레이어', () => {
  test('[렌더] 조정 레이어 아래만 밝아지고 위는 그대로', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createLayer } = await import('/src/core/doc/schema.js');
      const base = window.__store.get();
      const imgs = base.order.filter((x) => base.layers[x]?.type === 'image');
      const lowId = imgs[0], highId = imgs[1];

      function avgLumaAt(withAdjust) {
        const d = JSON.parse(JSON.stringify(base));
        // low, adjust, high 세 레이어만 보이게
        for (const x of d.order) d.layers[x].visible = false;
        d.layers[lowId].visible = true;
        d.layers[highId].visible = true;
        // 두 이미지가 안 겹치게 위치 분리
        d.layers[lowId].transform.x.value = 200; d.layers[lowId].transform.y.value = 200; d.layers[lowId].adjust = null;
        d.layers[highId].transform.x.value = 560; d.layers[highId].transform.y.value = 560; d.layers[highId].adjust = null;
        if (withAdjust) {
          const adj = createLayer('adjust', { name: '조정' });
          adj.adjust = { brightness: 200 };
          // low 바로 위, high 아래에 삽입: order 는 [위..아래]? demo order 는 push 순서(앞=아래로 그려짐).
          // frame.js 는 order 를 돌며 그린다. adjust 를 lowId 다음(위)로 넣는다.
          const li = d.order.indexOf(lowId);
          d.layers[adj.id] = adj;
          d.order.splice(li + 1, 0, adj.id); // low 다음(위)
          // high 는 adjust 보다 위에 오게: high 를 맨 뒤(가장 위)로 이동
          d.order = d.order.filter((x) => x !== highId); d.order.push(highId);
        }
        return { d };
      }
      function luma(d, cxPt, cyPt) {
        const assetsP = null;
        return 0;
      }
      // 렌더 후 각 이미지 중심의 평균 밝기 측정
      async function measure(withAdjust) {
        const { d } = avgLumaAt(withAdjust);
        const assets = await H.demoAssets(d);
        const { effects, motions } = await H.demoRegistries();
        const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
        const W = d.meta.width, Hh = d.meta.height;
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
        const img = cx.getImageData(0, 0, W, Hh).data;
        const box = (px, py, rad) => {
          let s = 0, nn = 0;
          for (let y = py - rad; y < py + rad; y++) for (let x = px - rad; x < px + rad; x++) {
            const k = (y * W + x) * 4; if (img[k + 3] < 128) continue;
            s += (img[k] + img[k + 1] + img[k + 2]) / 3; nn++;
          }
          return nn ? s / nn : 0;
        };
        return { low: box(200, 200, 25), high: box(560, 560, 25) };
      }
      const noAdj = await measure(false);
      const adj = await measure(true);
      return { noAdj, adj };
    });
    // 아래(low)는 밝아짐, 위(high)는 변화 거의 없음
    expect(r.adj.low).toBeGreaterThan(r.noAdj.low + 2);
    expect(Math.abs(r.adj.high - r.noAdj.high)).toBeLessThan(3);
  });

  test('[메뉴] 조정 추가 → type=adjust 레이어, 보정 섹션 표시', async ({ page }) => {
    await openApp(page);
    await page.click('.tl-layers-head .tl-add-btn');
    await page.click('.layer-add-item[data-kind="adjust"]');
    const type = await page.evaluate(() => {
      const id = window.__editorState.get().selection[0];
      return window.__store.get().layers[id]?.type;
    });
    expect(type).toBe('adjust');
    await page.waitForTimeout(80);
    await expect(page.locator('.inspector-section', { hasText: '보정' })).toBeVisible();
  });
});
