import { test, expect } from '@playwright/test';

// R23c: 테마 토글은 메뉴 막대 "보기 › 라이트/다크 테마"로 옮겼다.
async function toggleThemeViaMenu(page) {
  await page.locator('.menu-top', { hasText: '보기' }).click();
  await page.locator('.menu-item', { hasText: '라이트/다크 테마' }).click();
}

test.describe('P1 - 화면 틀', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
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
