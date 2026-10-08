// F2-6 — 카메라: 행 클릭 → 섹션·영역, X·Y·줌 키프레임.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('F2-6 — 카메라 버튼 → 카메라 섹션·영역, 키 넣으면 카메라 행', async ({ page }) => {
  await openApp(page);
  const camBtn = page.locator('.tl-layers-head .tl-cam-btn');
  await expect(camBtn).toBeVisible();
  await camBtn.click();
  expect(await page.evaluate(() => window.__editorState.get().cameraActive)).toBe(true);
  await expect(page.locator('.inspector-section', { hasText: '카메라' })).toBeVisible();

  // 카메라 키를 넣으면 타임라인에 카메라 행이 생긴다
  await page.evaluate(() => window.__store.apply({ type: 'setCameraProp', prop: 'zoom', value: 1.2, f: 0 }));
  await page.waitForTimeout(80);
  await expect(page.locator('.timeline-layers .tl-row-camera')).toBeVisible();
});

test('F2-6 — setCameraProp 값·키프레임, evalCamera 반영', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { evalCamera } = await import('/src/core/anim/evaluate.js');
    // 정적 줌 1.5
    window.__store.apply({ type: 'setCameraProp', prop: 'zoom', value: 1.5 });
    const zStatic = evalCamera(window.__store.get(), 0).zoom;
    // 키프레임: f0 zoom 1, f10 zoom 2
    window.__store.apply({ type: 'setCameraProp', prop: 'zoom', value: 1, f: 0 });
    window.__store.apply({ type: 'setCameraProp', prop: 'zoom', value: 2, f: 10 });
    const z0 = evalCamera(window.__store.get(), 0).zoom;
    const z5 = evalCamera(window.__store.get(), 5).zoom;
    const z10 = evalCamera(window.__store.get(), 10).zoom;
    return { zStatic, z0, z5, z10 };
  });
  expect(r.zStatic).toBeCloseTo(1.5, 3);
  expect(r.z0).toBeCloseTo(1, 3);
  expect(r.z10).toBeCloseTo(2, 3);
  expect(r.z5).toBeGreaterThan(1);
  expect(r.z5).toBeLessThan(2); // 보간
});

test('F2-6 — 카메라 섹션 줌 입력 → setCameraProp, 되돌리기', async ({ page }) => {
  await openApp(page);
  await page.locator('.tl-layers-head .tl-cam-btn').click();
  await page.waitForTimeout(80);
  const sec = page.locator('.inspector-section', { hasText: '카메라' });
  // 줌 숫자 칸(세 번째 num-input: X, Y, 줌)
  const zoomInput = sec.locator('.num-input').nth(2);
  await zoomInput.fill('150');
  await zoomInput.press('Enter');
  const z = await page.evaluate(() => window.__store.get().camera.zoom.value);
  expect(z).toBeCloseTo(1.5, 2);
  await page.evaluate(() => window.__store.undo());
  const z2 = await page.evaluate(() => window.__store.get().camera.zoom.value);
  expect(z2).toBeCloseTo(1, 2);
});
