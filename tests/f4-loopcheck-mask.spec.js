// F4-7 루프 검사 도구 + F4-4 이펙트 마스크(UI→렌더).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}

test('F4-7 — Ctrl+Shift+L: 이음새 깨진 레이어가 목록에, 클릭하면 선택', async ({ page }) => {
  await openApp(page);
  // 일부러 이음새 깨기: y 키 0→100 (frame 0 ≠ frame N)
  const id = await page.evaluate(() => {
    const doc = window.__store.get();
    const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
    window.__store.apply({ type: 'setProp', id, path: 'transform.y', value: 0, f: 0 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.y', value: 100, f: 23 });
    window.__editorState.set({ selection: [] });
    return id;
  });

  await page.locator('body').click();
  await page.keyboard.press('Control+Shift+L');
  await expect(page.locator('.loopcheck-modal')).toBeVisible();
  const rows = page.locator('.loopcheck-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(1);
  // 첫 문제 행 클릭 → 그 레이어 선택
  await rows.first().click();
  await expect(page.locator('.loopcheck-modal')).toBeHidden();
  const sel = await page.evaluate(() => window.__editorState.get().selection);
  expect(sel.length).toBe(1);
});

test('F4-7 — 이음새 없으면 "문제 없음"', async ({ page }) => {
  await openApp(page);
  // 데모 기본은 이음새가 없을 수도 있으니, 명시적으로 깨끗한 문서로
  await page.evaluate(() => {
    const doc = window.__store.get();
    for (const id of doc.order) {
      const L = doc.layers[id];
      for (const k of ['x', 'y', 'scale', 'rotation', 'alpha']) {
        if (L.transform[k]?.keys?.length) window.__store.apply({ type: 'setLayer', id, patch: { transform: { ...L.transform, [k]: { ...L.transform[k], keys: [] } } } });
      }
    }
  });
  await page.locator('body').click();
  await page.keyboard.press('Control+Shift+L');
  await expect(page.locator('.loopcheck-ok')).toBeVisible();
});

test('F4-4 — 이펙트 마스크: 소스 연결 → 렌더 변화(마스크 밖 잘림)', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;

    const doc = createDoc({ width: 128, height: 128, fps: 12, frameCount: 12 });
    // 마스크 소스: 작은 사각형(중앙 40x40)
    const maskSrc = createLayer('shape', { name: 'maskSrc' });
    maskSrc.shape = { kind: 'rect', w: 40, h: 40, fill: '#ffffff', stroke: null };
    maskSrc.transform.x.value = 64; maskSrc.transform.y.value = 64;
    // 효과: 화면 전체 점
    const fx = createLayer('effect', { name: 'fx', effectId: 'test-dots' });
    fx.params = { count: 3000, radius: 2, color: '#ffffff', phase: false }; fx.seed = 3;
    doc.layers[maskSrc.id] = maskSrc; doc.layers[fx.id] = fx;
    doc.order.push(maskSrc.id, fx.id);

    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    function opaque(withMask) {
      const d = JSON.parse(JSON.stringify(doc));
      d.layers[maskSrc.id].visible = false;              // 마스크 소스는 숨김
      if (withMask) d.layers[fx.id].mask = { sourceId: maskSrc.id, mode: 'alpha', invert: false, feather: 0 };
      const c = H.createCanvas(128, 128); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
      const data = cx.getImageData(0, 0, 128, 128).data;
      let n = 0, cornerN = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const a = data[(y * 128 + x) * 4 + 3];
        if (a > 0) { n++; if (x < 20 && y < 20) cornerN++; }
      }
      return { n, cornerN };
    }
    const no = opaque(false), yes = opaque(true);
    return { noN: no.n, yesN: yes.n, yesCorner: yes.cornerN };
  });
  expect(r.yesN).toBeLessThan(r.noN);   // 마스크로 잘려 픽셀 줄어듦
  expect(r.yesCorner).toBe(0);          // 마스크(중앙 사각형) 밖(모서리) 투명
});
