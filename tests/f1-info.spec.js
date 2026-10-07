// F1-9 — 움직이는 이미지·그룹·카메라 섹션 자리(읽기 전용 표시).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('F1-9 — 그룹 선택 → 그룹 정보(자식 수) 표시, 이미지 선택 시 숨김', async ({ page }) => {
  await openApp(page);
  // 도형 둘을 묶어 그룹 생성 후, 새로 생긴 group 레이어 id 를 찾는다.
  const gid = await page.evaluate(() => {
    const before = new Set(Object.keys(window.__store.get().layers));
    const doc = window.__store.get();
    const shapes = doc.order.filter((id) => doc.layers[id]?.type === 'shape').slice(0, 2);
    window.__store.apply({ type: 'group', ids: shapes });
    const after = window.__store.get().layers;
    return Object.keys(after).find((id) => !before.has(id) && after[id].type === 'group') ?? null;
  });
  expect(gid).toBeTruthy();

  await page.evaluate((id) => window.__editorState.set({ selection: [id] }), gid);
  await page.waitForTimeout(80);

  const groupSec = page.locator('.inspector-section', { hasText: '그룹' });
  await expect(groupSec).toBeVisible();
  await groupSec.locator('.inspector-section-header').first().click(); // 펼치기
  await expect(groupSec.locator('.info-value').first()).toContainText('개'); // 자식 N개

  // 이미지 선택 → 그룹 섹션 숨김
  const imgId = await page.evaluate(() => window.__store.get().order.find((id) => window.__store.get().layers[id]?.type === 'image'));
  await page.evaluate((id) => window.__editorState.set({ selection: [id] }), imgId);
  await page.waitForTimeout(80);
  await expect(groupSec).toBeHidden();
});

test('F1-9 — 카메라 키 없음 → 카메라 섹션 숨김 / anim 레이어 없음 → anim 섹션 숨김', async ({ page }) => {
  await openApp(page);
  // 데모에는 카메라 키·anim 레이어가 없다 → 두 섹션 모두 숨김(표시 조건 검증).
  await expect(page.locator('.inspector-section', { hasText: '카메라' })).toBeHidden();
  await expect(page.locator('.inspector-section', { hasText: '움직이는 이미지' })).toBeHidden();
});
