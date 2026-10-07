// F1 — 색 덮기 · 트랙 매트 · 외곽선 · 흩어지며 퇴장.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}
function imgId(page) {
  return page.evaluate(() => window.__store.get().order.find((id) => window.__store.get().layers[id]?.type === 'image'));
}
async function selectImage(page) {
  const id = await imgId(page);
  await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
  await page.waitForTimeout(80);
  return id;
}
function section(page, title) {
  return page.locator('.inspector-section', { hasText: title });
}

test.describe('F1 — 효과 섹션', () => {
  test('[색 덮기] 켜기 → tint 생성, 되돌리기 → 없음', async ({ page }) => {
    await openApp(page);
    const id = await selectImage(page);
    const sec = section(page, '색 덮기');
    await sec.locator('.inspector-section-header').first().click();
    await sec.locator('.fx-check input').check();
    const t = await page.evaluate((i) => window.__store.get().layers[i].tint, id);
    expect(t).toBeTruthy();
    expect(t.color).toBeTruthy();
    await page.evaluate(() => window.__store.undo());
    const t2 = await page.evaluate((i) => window.__store.get().layers[i].tint, id);
    expect(t2 == null).toBe(true);
  });

  test('[색 덮기 렌더] tint 강하면 결과가 덮을 색에 가까워짐', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function avgR(tint) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const x of d.order) d.layers[x].visible = (x === id);
        d.layers[id].tint = tint;
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
        const data = cx.getImageData(0, 0, W, Hh).data;
        let sr = 0, sb = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 128) continue; sr += data[i]; sb += data[i + 2]; n++; }
        return n ? { r: sr / n, b: sb / n } : { r: 0, b: 0 };
      }
      const base = avgR(null);
      const red = avgR({ color: '#ff0000', strength: 1 }); // 빨강 100%
      return { base, red };
    });
    // 빨강 100% 덮기 → 평균 R 증가, B 감소
    expect(r.red.r).toBeGreaterThan(r.base.r);
    expect(r.red.b).toBeLessThan(r.base.b + 1);
  });

  test('[트랙 매트] 자기 자신은 소스 후보에 없음', async ({ page }) => {
    await openApp(page);
    const id = await selectImage(page);
    const sec = section(page, '트랙 매트');
    await sec.locator('.inspector-section-header').first().click();
    await sec.locator('.fx-check input').first().check();  // '매트 사용'(반전 체크박스와 구분)
    // 소스 드롭다운 열기
    await sec.locator('.dropdown').first().click();
    const values = await page.locator('.dropdown-list .dropdown-option').evaluateAll(
      (els) => els.map((e) => e.dataset.value)
    );
    expect(values).not.toContain(id);     // 자기 자신 제외
    expect(values.length).toBeGreaterThan(1); // (없음) + 다른 레이어들
  });

  test('[외곽선] 켜기 → outline 생성, 렌더 시 불투명 픽셀 증가', async ({ page }) => {
    await openApp(page);
    const id = await selectImage(page);
    const sec = section(page, '외곽선');
    await sec.locator('.inspector-section-header').first().click();
    await sec.locator('.fx-check input').check();
    const o = await page.evaluate((i) => window.__store.get().layers[i].outline, id);
    expect(o).toBeTruthy();
    expect(o.width).toBeGreaterThan(0);

    // 렌더: 외곽선 있으면 불투명 픽셀이 더 많다
    const r = await page.evaluate(async (i) => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function opaque(outline) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const x of d.order) d.layers[x].visible = (x === i);
        d.layers[i].outline = outline;
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
        const data = cx.getImageData(0, 0, W, Hh).data;
        let n = 0; for (let k = 3; k < data.length; k += 4) if (data[k] >= 128) n++;
        return n;
      }
      return { none: opaque(null), ring: opaque({ color: '#ffffff', width: 6, quality: 3 }) };
    }, id);
    expect(r.ring).toBeGreaterThan(r.none);
  });

  test('[퇴장] 루프 이음새: frame 0 과 frame N 결과 동일', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = JSON.parse(JSON.stringify(window.__store.get()));
      const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
      for (const x of doc.order) doc.layers[x].visible = (x === id);
      const fc = doc.meta.frameCount;
      // 퇴장 구간을 [6, fc-1] 로 두면 frame 0(시작 전)·frame fc(종료 후) 모두 정상 전체 렌더
      // 경로 → 루프 이음새가 매끄럽다(두 끝이 같은 전체 이미지).
      doc.layers[id].exit = { type: 'disintegrate', startF: 6, endF: fc - 1 };
      doc.layers[id].seed = 7;
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function px(f) {
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, doc, f, {});
        return Array.from(cx.getImageData(0, 0, W, Hh).data);
      }
      const a = px(0), b = px(fc); // frame N(=fc) 은 모듈러로 frame 0 상태
      let same = a.length === b.length;
      for (let k = 0; same && k < a.length; k++) if (a[k] !== b[k]) same = false;
      return { same };
    });
    expect(r.same).toBe(true);
  });
});
