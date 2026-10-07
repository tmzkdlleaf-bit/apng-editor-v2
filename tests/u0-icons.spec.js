// U0 — 아이콘 세트. 필요한 아이콘이 모두 유효한 SVG 로 렌더되는지.
import { test, expect } from '@playwright/test';

const REQUIRED = [
  'eye', 'eye-off', 'lock', 'unlock',
  'first', 'prev', 'play', 'pause', 'next', 'last',
  'loop', 'once', 'pingpong',
  'select-tool', 'hand', 'zoom-in', 'zoom-out', 'zoom-fit',
  'undo', 'redo', 'plus', 'delete', 'duplicate', 'group', 'chevron',
  'diamond-filled', 'diamond-empty', 'diamond-outline',
  'magnet', 'autokey', 'settings', 'export', 'help', 'sun', 'moon',
  'type-image', 'type-anim', 'type-text', 'type-shape', 'type-effect', 'type-group', 'type-adjust', 'type-instance',
];

test('U0 — 아이콘: 필요한 이름이 모두 유효한 SVG 로 렌더', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async (names) => {
    const I = await import('/src/ui/icons.js');
    const out = { missing: [], bad: [], btnOk: false };
    for (const n of names) {
      if (!I.hasIcon(n)) { out.missing.push(n); continue; }
      const svg = I.createIcon(n, { label: n });
      if (!svg || svg.tagName.toLowerCase() !== 'svg' || svg.children.length === 0) out.bad.push(n);
    }
    // iconButton: 툴팁 + aria-label
    const b = I.iconButton('play', { label: '재생', title: '재생 (Space)' });
    out.btnOk = b.tagName === 'BUTTON' && b.getAttribute('aria-label') === '재생' && b.title === '재생 (Space)' && !!b.querySelector('svg');
    return out;
  }, REQUIRED);
  expect(r.missing).toEqual([]);
  expect(r.bad).toEqual([]);
  expect(r.btnOk).toBe(true);
});
