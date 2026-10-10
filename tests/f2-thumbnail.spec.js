// F2-4 — 레이어 썸네일: 표시 + 스크럽 중 재렌더 0회.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(200);
}

test('F2-4 — 레이어 행에 썸네일 표시', async ({ page }) => {
  await openApp(page);
  const n = await page.locator('.tl-thumb-canvas').count();
  expect(n).toBeGreaterThan(0);
});

test('F2-4 — 스크럽 24프레임 동안 썸네일 렌더 0회', async ({ page }) => {
  await openApp(page);
  await page.waitForFunction(() => !!window.__thumbnailer);
  // 최초 빌드 후 카운터 리셋
  const before = await page.evaluate(() => { window.__thumbnailer.resetRenders(); return window.__thumbnailer.renders; });
  expect(before).toBe(0);

  // 24프레임 스크럽(f 변경) — 레이어 목록은 f 에 재빌드하지 않으므로 썸네일 렌더 0
  await page.evaluate(async () => {
    for (let f = 0; f < 24; f++) {
      window.__editorState.set({ f });
      await new Promise((r) => setTimeout(r, 2));
    }
  });
  const after = await page.evaluate(() => window.__thumbnailer.renders);
  expect(after).toBe(0);
});

test('F2-4(보완) — 이미지 레이어 썸네일 중앙 픽셀이 투명하지 않다', async ({ page }) => {
  await openApp(page);
  const imgId = await page.evaluate(() => {
    const doc = window.__store.get();
    return Object.keys(doc.layers).find((x) => doc.layers[x]?.type === 'image') ?? null;
  });
  expect(imgId).not.toBeNull();
  // 에셋 디코딩이 끝나면 onUpdate 로 썸네일이 갱신된다 → 중앙 알파가 채워질 때까지 대기.
  const alpha = await page.waitForFunction((id) => {
    const row = document.querySelector(`.tl-row[data-id="${id}"]`);
    const cv = row && row.querySelector('canvas.tl-thumb-canvas');
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    const px = ctx.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
    return px[3] > 0 ? px[3] : null;
  }, imgId, { timeout: 8000 }).then((h) => h.jsonValue());
  expect(alpha).toBeGreaterThan(0);
});

test('F2-4 — 레이어 내용 바뀌면 썸네일 다시 그림(캐시 무효)', async ({ page }) => {
  await openApp(page);
  await page.waitForFunction(() => !!window.__thumbnailer);
  await page.evaluate(() => window.__thumbnailer.resetRenders());

  // 도형 색 변경 → 그 레이어 행 재빌드 시 서명이 달라져 다시 렌더
  const delta = await page.evaluate(() => {
    const doc = window.__store.get();
    const id = doc.order.find((x) => doc.layers[x]?.type === 'shape');
    window.__store.apply({ type: 'setLayer', id, patch: { shape: { ...doc.layers[id].shape, fill: '#123456' } } });
    return null;
  });
  await page.waitForTimeout(80);
  const renders = await page.evaluate(() => window.__thumbnailer.renders);
  // 최소 1회 이상(바뀐 레이어). 캐시된 나머지는 그대로일 수 있음.
  expect(renders).toBeGreaterThanOrEqual(1);
});
