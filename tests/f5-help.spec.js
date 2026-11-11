// F5-4 — 단축키 안내(단일 소스) + 처음 사용 안내.
import { test, expect } from './helpers/fixtures.js';

async function openReal(page) {
  await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} }); // 자동 안내 끔
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}
// R23c: 도움말은 메뉴 막대 "도움말 › 단축키 안내"로 옮겼다.
async function openHelpMenu(page) {
  await page.locator('.menu-top', { hasText: '도움말' }).click();
  await page.locator('.menu-item', { hasText: '단축키 안내' }).click();
}

test('F5-4 — 도움말 단축키 항목 수 == SHORTCUTS 표 항목 수', async ({ page }) => {
  await openReal(page);
  const nTable = await page.evaluate(async () => (await import('/src/ui/shortcuts.js')).SHORTCUTS.length);
  await openHelpMenu(page);
  await expect(page.locator('.help-modal')).toBeVisible();
  const nUI = await page.locator('.help-modal .shortcut-row').count();
  expect(nUI).toBe(nTable);
});

test('F5-4 — 단축키 검색', async ({ page }) => {
  await openReal(page);
  await openHelpMenu(page);
  await page.fill('.help-search', '내보내기');
  const rows = page.locator('.help-modal .shortcut-row');
  expect(await rows.count()).toBe(1);
  await expect(rows.first()).toContainText('내보내기');
});

test('R23c — 첫 실행에 자동 안내가 뜨지 않는다; 도움말 › 둘러보기로는 뜬다', async ({ page }) => {
  // onboarded 플래그 없이 로드해도 자동 안내는 뜨지 않는다(R23c에서 자동 시작 제거).
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(200);
  await expect(page.locator('.onboard-overlay')).toHaveCount(0);
  // "도움말 › 둘러보기" → 안내가 뜬다. 3단계 확인.
  await page.locator('.menu-top', { hasText: '도움말' }).click();
  await page.locator('.menu-item', { hasText: '둘러보기' }).click();
  await expect(page.locator('.onboard-overlay')).toBeVisible();
  await expect(page.locator('.onboard-step')).toContainText('1 / 3');
  await page.click('.onboard-next'); // 2
  await page.click('.onboard-next'); // 3
  await expect(page.locator('.onboard-next')).toHaveText('시작');
  await page.click('.onboard-next'); // 완료
  await expect(page.locator('.onboard-overlay')).toHaveCount(0);
});

test('F5-4 — 도움말에서 처음 안내 다시 보기', async ({ page }) => {
  await openReal(page); // onboarded=1
  await openHelpMenu(page);
  await page.click('.help-modal .quiet.sm'); // "처음 안내 다시 보기"
  await expect(page.locator('.onboard-overlay')).toBeVisible();
});
