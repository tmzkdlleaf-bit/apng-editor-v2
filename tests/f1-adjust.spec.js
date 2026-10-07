// F1 — 보정 섹션(기본+고급). 렌더/캐시는 엔진으로 직접, store 기록은 UI 슬라이더로 검증.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}
async function firstImageId(page) {
  return page.evaluate(() => {
    const doc = window.__store.get();
    return doc.order.find((id) => doc.layers[id]?.type === 'image') ?? null;
  });
}

test.describe('F1 — 보정', () => {
  test('[렌더] 밝기 200 → 평균 밝기 증가, 흐림 0 → 원본과 동일', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const imgId = doc.order.find((id) => doc.layers[id]?.type === 'image');
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, H2 = doc.meta.height;

      function avgLuma(adjust) {
        // 해당 이미지 레이어만 보이게 복제 문서
        const d = JSON.parse(JSON.stringify(doc));
        for (const id of d.order) d.layers[id].visible = (id === imgId);
        d.layers[imgId].adjust = adjust;
        const c = H.createCanvas(W, H2);
        const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.();
        eng.renderFrame(cx, d, 0, {});
        const data = cx.getImageData(0, 0, W, H2).data;
        let sum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3; n++;
        }
        return n ? sum / n : 0;
      }
      function pixels(adjust) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const id of d.order) d.layers[id].visible = (id === imgId);
        d.layers[imgId].adjust = adjust;
        const c = H.createCanvas(W, H2);
        const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.();
        eng.renderFrame(cx, d, 0, {});
        return Array.from(cx.getImageData(0, 0, W, H2).data);
      }

      const base = avgLuma(null);
      const bright = avgLuma({ brightness: 200 });
      const dark = avgLuma({ brightness: 50 });
      const p0 = pixels(null);
      const pBlur0 = pixels({ blur: 0 });
      let identical = p0.length === pBlur0.length;
      for (let i = 0; identical && i < p0.length; i++) if (p0[i] !== pBlur0[i]) identical = false;
      return { base, bright, dark, identical };
    });
    expect(r.bright).toBeGreaterThan(r.base + 1); // 밝기 200 → 평균 밝기 증가
    expect(r.dark).toBeLessThan(r.base - 1);      // 밝기 50 → 감소
    expect(r.identical).toBe(true);               // 흐림 0 → 원본과 동일
  });

  test('[캐시] 같은 프레임 두 번 렌더 → 보정 계산 1회', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = JSON.parse(JSON.stringify(window.__store.get()));
      const imgId = doc.order.find((id) => doc.layers[id]?.type === 'image');
      for (const id of doc.order) doc.layers[id].visible = (id === imgId);
      doc.layers[imgId].adjust = { brightness: 130, contrast: 120 };
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const c = H.createCanvas(doc.meta.width, doc.meta.height);
      const cx = c.getContext('2d', { willReadFrequently: true });
      eng.renderFrame(cx, doc, 0, {});
      const first = eng.stats().adjustRuns;
      eng.renderFrame(cx, doc, 0, {});
      const second = eng.stats().adjustRuns;
      return { first, second };
    });
    expect(r.first).toBe(1);   // 첫 렌더: 계산 1회
    expect(r.second).toBe(0);  // 두 번째: 캐시 재사용, 계산 안 함
  });

  test('[UI] 밝기 슬라이더 변경 → store 기록 1건 → 되돌리기 → 원래 값', async ({ page }) => {
    await openApp(page);
    const imgId = await firstImageId(page);
    await page.evaluate((id) => window.__editorState.set({ selection: [id] }), imgId);
    await page.waitForTimeout(100);

    // 보정 섹션 펼치기
    const header = page.locator('.inspector-section', { hasText: '보정' }).locator('.inspector-section-header').first();
    await header.click();

    const before = await page.evaluate((id) => window.__store.get().layers[id].adjust?.brightness ?? 100, imgId);
    const undoLenBefore = await page.evaluate(() => window.__store.undoDepth?.() ?? null);

    // 밝기 슬라이더(첫 slider-range): pointerdown → 값+input → pointerup = begin/preview/commit
    const slider = page.locator('.inspector-section', { hasText: '보정' }).locator('.slider-range').first();
    await slider.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.value = '160';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });

    const after = await page.evaluate((id) => window.__store.get().layers[id].adjust?.brightness ?? 100, imgId);
    expect(after).toBe(160);
    expect(after).not.toBe(before);

    // 되돌리기 → 원래 값
    await page.evaluate(() => window.__store.undo());
    const reverted = await page.evaluate((id) => window.__store.get().layers[id].adjust?.brightness ?? 100, imgId);
    expect(reverted).toBe(before);
  });
});
