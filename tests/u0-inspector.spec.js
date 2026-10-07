// U0-6 — 속성 패널: 준비 중 섹션 펼침 안내 · 섹션 머리 버튼 · 마름모 히트 24×24.
import { test, expect } from '@playwright/test';

async function openAppWithLayer(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  // 첫 레이어 선택 → 인스펙터 섹션 표시
  await page.evaluate(() => {
    const ids = window.__store.get().order;
    if (ids.length) window.__editorState.set({ selection: [ids[0]] });
  });
  await page.waitForTimeout(100);
}

test('U0-6 — "준비 중" 섹션: 펼치면 안내 한 줄 + 항목명', async ({ page }) => {
  await openAppWithLayer(page);
  // 접힌 placeholder 섹션(보정 등) 찾기
  const r = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('.inspector-section')];
    const ph = secs.find((s) => s.querySelector('.inspector-soon'));
    if (!ph) return { found: false };
    const header = ph.querySelector('.inspector-section-header');
    const wasCollapsed = ph.classList.contains('collapsed');
    header.click(); // 펼치기
    const msg = ph.querySelector('.inspector-soon-msg')?.textContent ?? '';
    const visible = getComputedStyle(ph.querySelector('.inspector-section-body')).display !== 'none';
    return { found: true, wasCollapsed, msg, visible, role: header.getAttribute('role') };
  });
  expect(r.found).toBe(true);
  expect(r.wasCollapsed).toBe(true);
  expect(r.msg).toContain('다음 업데이트');
  expect(r.visible).toBe(true);
  expect(r.role).toBe('button');
});

test('U0-6 — 키프레임 마름모 히트 영역 24×24', async ({ page }) => {
  await openAppWithLayer(page);
  const size = await page.evaluate(() => {
    const d = document.querySelector('.kf-diamond');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(size).not.toBeNull();
  expect(size.w).toBe(24);
  expect(size.h).toBe(24);
});
