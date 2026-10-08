// F3-2 — 움직임 섹션: 갤러리·적용·덮어쓰기 확인·클립 편집.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}
async function selectShape(page) {
  const id = await page.evaluate(() => window.__store.get().order.find((x) => window.__store.get().layers[x]?.type === 'shape'));
  await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
  await page.waitForTimeout(80);
  return id;
}
function motionSec(page) { return page.locator('.inspector-section', { hasText: '움직임' }); }

test('F3-2 — 모션 추가 갤러리 → 적용 시 클립 1개·기록 1건', async ({ page }) => {
  await openApp(page);
  const id = await selectShape(page);
  const depth0 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);

  await motionSec(page).getByText('+ 모션 추가').click();
  await expect(page.locator('.motion-gallery')).toBeVisible();
  const cards = page.locator('.motion-gallery .mg-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  // '위아래 둥실' 카드 클릭
  await page.locator('.mg-card[data-motion="test-float"]').click();

  const clips = await page.evaluate((i) => window.__store.get().layers[i].clips, id);
  expect(clips.length).toBe(1);
  expect(clips[0].motionId).toBe('test-float');
  const depth1 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  if (depth0 >= 0 && depth1 >= 0) expect(depth1 - depth0).toBe(1);
});

test('F3-2 — 덮어쓰기 확인: 키 있는 속성에 적용 → 확인창, 취소 시 변화 없음', async ({ page }) => {
  await openApp(page);
  const id = await selectShape(page);
  // y 에 키프레임
  await page.evaluate((i) => {
    window.__store.apply({ type: 'setProp', id: i, path: 'transform.y', value: 50, f: 0 });
    window.__store.apply({ type: 'setProp', id: i, path: 'transform.y', value: 150, f: 12 });
  }, id);

  // confirm 을 취소(false)로
  page.on('dialog', (d) => d.dismiss());
  const before = await page.evaluate((i) => (window.__store.get().layers[i].clips ?? []).length, id);
  await motionSec(page).getByText('+ 모션 추가').click();
  await page.locator('.mg-card[data-motion="test-float"]').click(); // y 를 바꾸는 모션 → 확인창
  await page.waitForTimeout(100);
  const after = await page.evaluate((i) => (window.__store.get().layers[i].clips ?? []).length, id);
  expect(after).toBe(before); // 취소 → 변화 없음
});

test('F3-2 — 클립 선택·파라미터(노브) 변경이 클립에 반영', async ({ page }) => {
  await openApp(page);
  const id = await selectShape(page);
  // 모션 하나 적용
  await page.evaluate(async (i) => {
    const { createClip } = await import('/src/core/doc/schema.js');
    const m = (await import('/src/motions/registry.js')).getMotion('test-float');
    const clip = createClip(m, { start: 0 });
    window.__store.apply({ type: 'addClip', id: i, clip });
  }, id);
  await page.waitForTimeout(80);
  // 클립 행 선택
  await motionSec(page).locator('.motion-clip-row').first().click();
  await page.waitForTimeout(60);
  // 세부(진폭 파라미터) 숫자 칸 — 편집 영역의 마지막 num-input
  const num = motionSec(page).locator('.motion-clip-edit .num-input').last();
  await num.fill('60');
  await num.press('Enter');
  const amp = await page.evaluate((i) => window.__store.get().layers[i].clips[0].params.amplitude, id);
  expect(amp).toBe(60);
});
