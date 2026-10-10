// 4단계 화면 검수 보완 — 항목 3(라벨 줄바꿈 0), 4(갤러리 창 크기·카드), 5(트랙 폭 맞춤).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('item 3 — 속성 패널의 모든 라벨이 한 줄(줄바꿈 0)', async ({ page }) => {
  await openApp(page);
  // 섹션이 많은 도형 레이어 선택
  const id = await page.evaluate(() => window.__store.get().order.find((x) => window.__store.get().layers[x]?.type === 'shape'));
  await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
  await page.waitForTimeout(100);
  // 접힌 섹션 모두 펼치기
  await page.evaluate(() => {
    for (const h of document.querySelectorAll('[data-region="inspector"] .inspector-section.collapsed .inspector-section-header')) h.click();
  });
  await page.waitForTimeout(100);
  const bad = await page.evaluate(() => {
    const out = [];
    const labels = document.querySelectorAll('[data-region="inspector"] .num-label, [data-region="inspector"] .prop-row > label');
    for (const el of labels) {
      if (!el.textContent.trim()) continue;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      // 한 줄이면 높이가 대략 lineHeight 이하. 두 줄 이상이면 그 1.8배를 넘는다.
      if (el.offsetHeight > lh * 1.8 + 2) out.push({ t: el.textContent.trim(), h: el.offsetHeight, lh });
    }
    return out;
  });
  expect(bad, JSON.stringify(bad)).toEqual([]);
});

test('item 4 — 이펙트 갤러리 창 ≥ 880×560, 카드 높이 ≥ 120px', async ({ page }) => {
  await openApp(page);
  await page.click('.tl-layers-head .tl-add-btn');
  await page.click('.layer-add-item[data-kind="effect"]');
  await expect(page.locator('.gallery-panel')).toBeVisible();
  const panel = await page.locator('.gallery-panel').boundingBox();
  expect(panel.width).toBeGreaterThanOrEqual(880);
  expect(panel.height).toBeGreaterThanOrEqual(560);
  const card = await page.locator('.gallery-card').first().boundingBox();
  expect(card.height).toBeGreaterThanOrEqual(120);
});

test('item 5 — 트랙 폭 맞춤: 마지막 프레임 칸 오른쪽 끝이 트랙 폭 ±1칸', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const canvas = document.querySelector('.track-body-canvas');
    const tracks = document.querySelector('.timeline-tracks');
    const fc = window.__store.get().meta.frameCount ?? 1;
    const totalW = canvas ? canvas.getBoundingClientRect().width : 0;
    const wrapW  = tracks ? tracks.clientWidth : 0;
    return { totalW, wrapW, fc };
  });
  expect(m.wrapW).toBeGreaterThan(400);
  const cell = m.totalW / m.fc; // 한 칸 폭
  expect(Math.abs(m.totalW - m.wrapW)).toBeLessThanOrEqual(cell + 1);
});
