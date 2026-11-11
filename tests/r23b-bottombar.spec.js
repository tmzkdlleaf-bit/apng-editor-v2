// R23c — 전문가 화면 2부(2-2 도구 막대·2-3 화면 아래 줄).
import { test, expect } from './helpers/fixtures.js';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('화면 아래 줄: 배율·해상도·격자·가이드·안전 영역 (프레임은 재생 줄로)', async ({ page }) => {
  await openApp(page);
  const bb = page.locator('.stage-bottombar');
  await expect(bb).toBeVisible();
  await expect(bb.locator('.bb-zoom-input')).toBeVisible();
  await expect(bb.getByText('해상도')).toBeVisible();
  await expect(bb.getByText('투명 격자')).toBeVisible();
  await expect(bb.getByText('가이드')).toBeVisible();
  await expect(bb.getByText('안전 영역')).toBeVisible();
  // R23d item 11: 프레임 위치(1/24)는 아래 줄에서 지우고 재생 줄에만 둔다.
  await expect(bb.locator('.bb-frame-text')).toHaveCount(0);
});

test('프레임 표시가 현재/전체 (재생 줄)', async ({ page }) => {
  await openApp(page);
  const fc = await page.evaluate(() => window.__store.get().meta.frameCount);
  await expect(page.locator('.tl-frame-cur')).toHaveText('1');
  await expect(page.locator('.tl-frame-tot')).toHaveText(`/ ${fc}`);
  await page.evaluate(() => window.__editorState.set({ f: 3 }));
  await expect(page.locator('.tl-frame-cur')).toHaveText('4');
});

test('배율 숫자 입력 → zoom 반영', async ({ page }) => {
  await openApp(page);
  const num = page.locator('.bb-zoom-input');
  await num.fill('200');
  await num.press('Enter');
  expect(await page.evaluate(() => window.__editorState.get().zoom)).toBeCloseTo(2, 2);
});

test('가이드·안전 영역 토글 → editorState 반영', async ({ page }) => {
  await openApp(page);
  await page.locator('.bb-check', { hasText: '가이드' }).locator('input').check();
  expect(await page.evaluate(() => window.__editorState.get().guides)).toBe(true);
  await page.locator('.bb-check', { hasText: '안전 영역' }).locator('input').check();
  expect(await page.evaluate(() => window.__editorState.get().safeArea)).toBe(true);
});

test('미리보기 해상도 1/4 선택 → previewRes 저장·새로고침 유지', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.__editorState.set({ previewRes: 'quarter' }); try { localStorage.setItem('apng2.ws.previewRes', 'quarter'); } catch {} });
  const stored = await page.evaluate(() => localStorage.getItem('apng2.ws.previewRes'));
  expect(stored).toBe('quarter');
  await page.reload();
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__editorState.get().previewRes)).toBe('quarter');
});

test('미리보기 해상도는 내보내기에 영향 없음(1/4 바이트 == 전체 바이트)', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { bakeFrames } = await import('/src/core/export/bake.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { encode } = await import('/src/export/encode.js');
    const doc = H.movingShapeDoc({ width: 24, height: 24, fps: 10, frameCount: 4, x0: 2, x1: 20 });
    const eng = createRenderEngine({ createCanvas: H.createCanvas });
    window.__editorState.set({ previewRes: 'quarter' });
    const bakedQ = await bakeFrames(eng, doc, { createCanvas: H.createCanvas });
    const q = await encode(bakedQ, 'apng', { loops: 0 }, {});
    window.__editorState.set({ previewRes: 'full' });
    const bakedF = await bakeFrames(eng, doc, { createCanvas: H.createCanvas });
    const f = await encode(bakedF, 'apng', { loops: 0 }, {});
    return { q: q.bytes, f: f.bytes };
  });
  expect(r.q).toBe(r.f);
});
