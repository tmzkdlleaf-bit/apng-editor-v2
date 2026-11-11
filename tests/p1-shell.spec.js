import { test, expect } from '@playwright/test';

// R23c: 테마 토글은 메뉴 막대 "보기 › 라이트/다크 테마"로 옮겼다.
async function toggleThemeViaMenu(page) {
  const view = page.locator('.menu-top', { hasText: '보기' });
  await view.waitFor();
  const dd = page.locator('.menu-group:has(.menu-top:text-is("보기")) .menu-dropdown');
  const item = dd.locator('.menu-item', { hasText: '라이트/다크 테마' });
  // 메뉴 막대에는 드물게 열린 직후 닫히는 레이스가 있다(열기 클릭과 항목 클릭 사이).
  //   항목을 실제로 눌러야 테마가 바뀌므로, 닫혀 있으면 다시 열고 누르기를 성공할 때까지 재시도한다
  //   (성공 1회 = 토글 1회).
  await expect(async () => {
    if (!(await dd.isVisible())) await view.click();
    await item.click({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
}

test.describe('P1 - 화면 틀', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 앱 초기화를 기다린다 — 메뉴 막대 클릭이 init 과 경쟁하지 않게(부하에서 흔들리던 원인).
    await page.waitForFunction(() => !!(window.__store && window.__stage));
  });

  test('4개 영역이 모두 존재한다', async ({ page }) => {
    await expect(page.locator('[data-region="topbar"]')).toBeVisible();
    await expect(page.locator('[data-region="canvas"]')).toBeVisible();
    await expect(page.locator('[data-region="timeline"]')).toBeVisible();
    await expect(page.locator('[data-region="inspector"]')).toBeVisible();
  });

  test('기본 테마가 dark 또는 light 중 하나다', async ({ page }) => {
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(['dark', 'light']).toContain(theme);
  });

  test('테마 버튼을 누르면 data-theme가 반대 값으로 바뀐다', async ({ page }) => {
    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await toggleThemeViaMenu(page);
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(after).not.toBe(before);
    expect(['dark', 'light']).toContain(after);
  });

  test('테마 버튼을 두 번 누르면 원래 테마로 돌아온다', async ({ page }) => {
    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await toggleThemeViaMenu(page);
    await toggleThemeViaMenu(page);
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(after).toBe(before);
  });

  test('테마가 localStorage에 저장된다', async ({ page }) => {
    await toggleThemeViaMenu(page);
    const stored = await page.evaluate(() =>
      localStorage.getItem('apng2.theme')
    );
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(stored).toBe(theme);
  });

  test('새로고침 후에도 테마가 유지된다', async ({ page }) => {
    await toggleThemeViaMenu(page);
    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await page.reload();
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(after).toBe(before);
  });
});
