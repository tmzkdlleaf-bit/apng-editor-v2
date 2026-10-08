// F2-9 — 분배(3개 이상 균등 간격) + 그리드 간격 선택.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('F2-9 — 가로 분배: 3개 선택 → 중심 간격 같음, 기록 1건', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const { createLayer } = window.__schema ?? {};
    const doc = window.__store.get();
    const made = [];
    const xs = [100, 150, 500]; // 불균등
    for (let i = 0; i < 3; i++) {
      // 도형 레이어 추가 후 x 설정
      const before = new Set(Object.keys(window.__store.get().layers));
      window.__store.apply({ type: 'addLayer', layer: _mkShape(window), index: window.__store.get().order.length });
      const nowDoc = window.__store.get();
      const id = Object.keys(nowDoc.layers).find((k) => !before.has(k));
      made.push(id);
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: xs[i] });
      window.__store.apply({ type: 'setProp', id, path: 'transform.y', value: 300 });
    }
    window.__editorState.set({ selection: made });
    return made;

    function _mkShape() {
      // createLayer 를 window 로 못 가져오면 수동 구성
      return {
        id: 'sh_' + Math.random().toString(36).slice(2, 9),
        type: 'shape', name: '도형', parentId: null, visible: true, locked: false,
        blend: 'normal', opacity: 1,
        transform: { x: { value: 0 }, y: { value: 0 }, scale: { value: 1 }, rotation: { value: 0 }, alpha: { value: 1 } },
        anchor: { x: 0.5, y: 0.5 }, clips: [], mask: null, adjust: null, tint: null, outline: null, exit: null,
        shape: { kind: 'rect', w: 40, h: 40, fill: '#ffffff', stroke: null },
      };
    }
  });
  await page.waitForTimeout(80);

  const depth0 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  await page.locator('.align-btn[data-align="dist-h"]').click();

  const xs = await page.evaluate((arr) => {
    const doc = window.__store.get();
    return arr.map((id) => doc.layers[id].transform.x.value).sort((a, b) => a - b);
  }, ids);
  const g1 = xs[1] - xs[0], g2 = xs[2] - xs[1];
  expect(Number.isFinite(g1) && Number.isFinite(g2)).toBe(true);
  expect(Math.abs(g1 - g2)).toBeLessThan(0.5); // 간격 같음

  const depth1 = await page.evaluate(() => window.__store.undoDepth?.() ?? -1);
  if (depth1 >= 0 && depth0 >= 0) expect(depth1 - depth0).toBe(1); // 기록 1건
});

test('F2-9 — 그리드 간격 드롭다운 → editorState.gridStep 변경', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const id = window.__store.get().order[0];
    window.__editorState.set({ selection: [id] });
  });
  await page.waitForTimeout(80);
  const dd = page.locator('.inspector-section .dropdown[aria-label="그리드 간격"]');
  await dd.scrollIntoViewIfNeeded();
  await dd.click();
  await page.locator('.dropdown-list [data-value="64"]').click();
  const gs = await page.evaluate(() => window.__editorState.get().gridStep);
  expect(gs).toBe(64);
});
