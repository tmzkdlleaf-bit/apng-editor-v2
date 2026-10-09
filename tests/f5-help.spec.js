// F5-4 — 단축키 안내(단일 소스) + 처음 사용 안내.
import { test, expect } from '@playwright/test';

async function openReal(page) {
  await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} }); // 자동 안내 끔
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}

test('F5-4 — 도움말 단축키 항목 수 == SHORTCUTS 표 항목 수', async ({ page }) => {
  await openReal(page);
  const nTable = await page.evaluate(async () => (await import('/src/ui/shortcuts.js')).SHORTCUTS.length);
  await page.click('[data-action="help"]');
  await expect(page.locator('.help-modal')).toBeVisible();
  const nUI = await page.locator('.help-modal .shortcut-row').count();
  expect(nUI).toBe(nTable);
});

test('F5-4 — 단축키 검색', async ({ page }) => {
  await openReal(page);
  await page.click('[data-action="help"]');
  await page.fill('.help-search', '내보내기');
  const rows = page.locator('.help-modal .shortcut-row');
  expect(await rows.count()).toBe(1);
  await expect(rows.first()).toContainText('내보내기');
});

test('F5-4 — 처음 안내: 첫 실행 시 뜸, 건너뛰기 후 안 뜸', async ({ page }) => {
  // onboarded 플래그 없이 로드 → 안내 떠야 함
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await expect(page.locator('.onboard-overlay')).toBeVisible();
  // 3단계 확인: 다음 두 번 → 시작
  await expect(page.locator('.onboard-step')).toContainText('1 / 3');
  await page.click('.onboard-next'); // 2
  await page.click('.onboard-next'); // 3
  await expect(page.locator('.onboard-next')).toHaveText('시작');
  await page.click('.onboard-next'); // 완료
  await expect(page.locator('.onboard-overlay')).toHaveCount(0);
  // 다시 로드 → 안 뜸
  await page.reload();
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(200);
  await expect(page.locator('.onboard-overlay')).toHaveCount(0);
});

test('F5-4 — 도움말에서 처음 안내 다시 보기', async ({ page }) => {
  await openReal(page); // onboarded=1
  await page.click('[data-action="help"]');
  await page.click('.help-modal .quiet.sm'); // "처음 안내 다시 보기"
  await expect(page.locator('.onboard-overlay')).toBeVisible();
});
