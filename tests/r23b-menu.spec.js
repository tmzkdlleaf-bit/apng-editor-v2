// R23c — 전문가 화면 2부(2-1): 메뉴 막대.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

async function addShape(page) {
  return page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '네모' });
    l.shape = { kind: 'rect', w: 80, h: 60, fill: '#ff8800', stroke: null };
    l.transform.x.value = 120; l.transform.y.value = 100;
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  });
}

test('메뉴 7개가 열리고 드롭다운이 보인다', async ({ page }) => {
  await openApp(page);
  for (const label of ['파일', '편집', '레이어', '효과', '애니메이션', '보기', '도움말']) {
    const top = page.locator('.menu-top', { hasText: label });
    await expect(top).toBeVisible();
    await top.click();
    await expect(page.locator('.menu-group', { has: top }).locator('.menu-dropdown')).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('편집 › 되돌리기가 Ctrl+Z 와 같은 결과', async ({ page }) => {
  await openApp(page);
  const id = await addShape(page);
  await page.evaluate((i) => window.__store.apply({ type: 'setLayer', id: i, patch: { name: '바뀜' } }), id);
  expect(await page.evaluate((i) => window.__store.get().layers[i].name, id)).toBe('바뀜');

  await page.locator('.menu-top', { hasText: '편집' }).click();
  await page.locator('.menu-item', { hasText: '되돌리기' }).click();
  expect(await page.evaluate((i) => window.__store.get().layers[i].name, id)).toBe('네모');
});

test('메뉴의 단축키 글자가 SHORTCUTS 표와 일치(표에 없는 키 0개)', async ({ page }) => {
  await openApp(page);
  const tableKeys = await page.evaluate(async () => {
    const { SHORTCUTS } = await import('/src/ui/shortcuts.js');
    return SHORTCUTS.map((s) => s.keys.join('+'));
  });
  const tableSet = new Set(tableKeys);
  const shown = [];
  for (const label of ['파일', '편집', '레이어', '효과', '애니메이션', '보기', '도움말']) {
    await page.locator('.menu-top', { hasText: label }).click();
    const keys = await page.locator('.menu-group:has(.menu-top:text-is("' + label + '")) .menu-dropdown .menu-key').allTextContents();
    shown.push(...keys);
    await page.keyboard.press('Escape');
  }
  // 메뉴에 보인 단축키는 모두 표에 있어야 한다.
  const notInTable = shown.filter((k) => !tableSet.has(k));
  expect(notInTable, JSON.stringify(notInTable)).toEqual([]);
});

test('Alt → 오른쪽 화살표 → 아래 → Enter 로 항목 실행', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => window.__editorState.get().grid);
  await page.locator('.menubar').waitFor();
  // Alt 로 막대 초점 → 보기(파일0·편집1·레이어2·효과3·애니4·보기5)로 이동 → 열기 → "격자"로 내려 실행.
  await page.keyboard.press('Alt');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); // 파일 → 보기
  await page.keyboard.press('ArrowDown'); // 메뉴 열고 첫 항목(확대)
  // "격자"까지: 확대·축소·화면에 맞추기·(구분)·격자 → 아래로 3번 더
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const after = await page.evaluate(() => window.__editorState.get().grid);
  expect(after).toBe(!before);
});

test('보기 › 작업 공간 초기화 후 패널이 기본 폭', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.__noReload = true; });
  // 오른쪽 패널 폭을 바꿔 둔다.
  await page.evaluate(() => localStorage.setItem('apng2.ws.right', JSON.stringify({ width: 520, collapsed: false, active: 'props' })));
  await page.locator('.menu-top', { hasText: '보기' }).click();
  await page.locator('.menu-item', { hasText: '작업 공간 초기화' }).click();
  await page.waitForTimeout(50);
  const stored = await page.evaluate(() => localStorage.getItem('apng2.ws.right'));
  expect(stored).toBeNull(); // 초기화로 저장값이 지워진다
});

test('지원 안 되는 항목은 흐리게(선택 없음에서 그룹으로 묶기)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__editorState.set({ selection: [] }));
  await page.locator('.menu-top', { hasText: '레이어' }).click();
  const item = page.locator('.menu-item', { hasText: '그룹으로 묶기' });
  await expect(item).toBeDisabled();
});

test('위쪽 막대에 테마·도움말 버튼이 없다(메뉴로 옮김)', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#btn-theme')).toHaveCount(0);
  await expect(page.locator('[data-action="help"]')).toHaveCount(0);
  await expect(page.locator('.menubar')).toBeVisible();
});
