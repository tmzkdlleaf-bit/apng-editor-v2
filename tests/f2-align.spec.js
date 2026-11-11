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

test('정렬 — 카메라 무시 토글: 기본은 보이는 화면, 켜면 원래 문서 좌표', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(() => {
    const before = new Set(Object.keys(window.__store.get().layers));
    window.__store.apply({ type: 'addLayer', index: window.__store.get().order.length, layer: {
      id: 'sh_' + Math.random().toString(36).slice(2, 9),
      type: 'shape', name: '도형', parentId: null, visible: true, locked: false,
      blend: 'normal', opacity: 1,
      transform: { x: { value: 300 }, y: { value: 300 }, scale: { value: 1 }, rotation: { value: 0 }, alpha: { value: 1 } },
      anchor: { x: 0.5, y: 0.5 }, clips: [], mask: null, adjust: null, tint: null, outline: null, exit: null,
      shape: { kind: 'rect', w: 40, h: 40, fill: '#ffffff', stroke: null },
    } });
    const doc = window.__store.get();
    const nid = Object.keys(doc.layers).find((k) => !before.has(k));
    // 항등이 아닌 카메라(줌 2, 중심 x=100) → 보이는 화면과 원래 문서 좌표가 갈린다.
    window.__store.apply({ type: 'setCameraProp', prop: 'zoom', value: 2 });
    window.__store.apply({ type: 'setCameraProp', prop: 'x', value: 100 });
    window.__editorState.set({ selection: [nid] });
    return nid;
  });
  await page.waitForTimeout(80);

  const alignSec = page.locator('.inspector-section:has(.inspector-section-title:text-is("정렬"))');

  // 카메라 무시 ON → 원래 문서 좌표 기준: 왼쪽 정렬이면 raw 왼쪽 가장자리 0 (hw=20 → transform.x=20).
  await alignSec.locator('.align-ignore-cam').check();
  await alignSec.locator('.align-btn[data-align="left"]').click();
  const xIgnore = await page.evaluate((i) => window.__store.get().layers[i].transform.x.value, id);
  expect(xIgnore).toBeCloseTo(20, 1);

  // 카메라 무시 OFF(기본) → 보이는 화면 기준: 카메라가 반영돼 raw-0 과 다른 값.
  await alignSec.locator('.align-ignore-cam').uncheck();
  await alignSec.locator('.align-btn[data-align="left"]').click();
  const xCam = await page.evaluate((i) => window.__store.get().layers[i].transform.x.value, id);
  expect(Math.abs(xCam - 20)).toBeGreaterThan(1);
});

test('F2-9(item 7) — 화면 아래 줄의 격자 간격 드롭다운 → editorState.gridStep 변경', async ({ page }) => {
  await openApp(page);
  // R23d item 6: 그리드 간격은 화면 "보기" 메뉴를 지우고 화면 아래 줄(bottombar)로 옮겼다.
  const dd = page.locator('.stage-bottombar .dropdown[aria-label="격자 간격"]');
  await dd.click();
  await page.locator('.dropdown-list [data-value="64"]').click();
  const gs = await page.evaluate(() => window.__editorState.get().gridStep);
  expect(gs).toBe(64);
});
