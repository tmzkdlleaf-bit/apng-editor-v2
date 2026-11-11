// R23d 1부 — 화면 버그 수정 검증.
//   메뉴 가려짐·새 장면 창·아이콘 원/사각형·가져오기 자동 레이어·효과 컨트롤 줄·작은 정리.
import { test, expect } from '@playwright/test';
import { expectOnTop } from './helpers/on-top.js';

async function openApp(page, { width = 1440, height = 900 } = {}) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  await page.waitForTimeout(120);
}

async function openLeftProject(page) {
  const collapsed = await page.locator('.panel-dock-left.is-collapsed').count();
  if (collapsed) await page.locator('.panel-dock-left .panel-collapse').click();
  await page.locator('.panel-dock-left .panel-tab', { hasText: '프로젝트' }).click();
}

// ── 1. 메뉴 ────────────────────────────────────────────────────────────────
test('메뉴: 닫히면 보이는 드롭다운 0개, 파일 열면 맨 위, 새 장면 → 창', async ({ page }) => {
  await openApp(page);
  // 닫힌 상태: 크기 > 0 으로 보이는 드롭다운이 하나도 없어야 한다(둥근 빈 상자 줄무늬 버그).
  expect(await page.locator('.menu-dropdown:visible').count()).toBe(0);

  await page.locator('.menu-top', { hasText: '파일' }).click();
  const dd = page.locator('.menu-group:has(.menu-top:text-is("파일")) .menu-dropdown');
  await expect(dd).toBeVisible();
  await expectOnTop(page, dd);

  await page.locator('.menu-item', { hasText: '새 장면' }).click();
  await expect(page.locator('.newscene-modal')).toBeVisible();
});

test('프로젝트 이름 메뉴가 맨 위에 보인다', async ({ page }) => {
  await openApp(page);
  await page.locator('.project-name-btn').click();
  const menu = page.locator('.project-menu').first();
  await expect(menu).toBeVisible();
  await expectOnTop(page, menu);
});

// ── 2. 새 장면 창 ───────────────────────────────────────────────────────────
test('새 장면 창: 화면 가운데, #app 안 밀림, Esc 닫힘', async ({ page }) => {
  await openApp(page);
  const appBefore = await page.locator('#app').boundingBox();

  await page.locator('.menu-top', { hasText: '파일' }).click();
  await page.locator('.menu-item', { hasText: '새 장면' }).click();
  const box = await page.locator('.newscene-box').boundingBox();
  const vp = page.viewportSize();
  expect(Math.abs((box.x + box.width / 2) - vp.width / 2)).toBeLessThanOrEqual(20);
  expect(Math.abs((box.y + box.height / 2) - vp.height / 2)).toBeLessThanOrEqual(20);

  const appDuring = await page.locator('#app').boundingBox();
  expect(Math.abs(appDuring.x - appBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(appDuring.y - appBefore.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(appDuring.height - appBefore.height)).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.newscene-modal')).toHaveCount(0);
});

// ── 3. 아이콘 ──────────────────────────────────────────────────────────────
test('아이콘: 원·사각형이 제대로 그려진다(undefined/NaN 없음)', async ({ page }) => {
  await openApp(page);
  const res = await page.evaluate(async () => {
    const m = await import('/src/ui/icons.js');
    const names = m.iconNames();
    const bad = [], badShape = [];
    const wrap = document.createElement('div');
    for (const n of names) {
      const svg = m.iconMarkup(n);
      if (/undefined|NaN/.test(svg)) bad.push(n);
      wrap.innerHTML = svg;
      for (const c of wrap.querySelectorAll('circle')) {
        if (!Number.isFinite(parseFloat(c.getAttribute('r')))) badShape.push(n + ':circle');
      }
      for (const rc of wrap.querySelectorAll('rect')) {
        if (!Number.isFinite(parseFloat(rc.getAttribute('rx')))) badShape.push(n + ':rect');
      }
    }
    return { bad, badShape, total: names.length };
  });
  expect(res.bad, JSON.stringify(res.bad)).toEqual([]);
  expect(res.badShape, JSON.stringify(res.badShape)).toEqual([]);
  expect(res.total).toBeGreaterThan(10);
});

test('첫 화면 로드: 콘솔 오류 0개', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(300);
  expect(errors, errors.join('\n')).toEqual([]);
});

// ── 4. 가져오기 ────────────────────────────────────────────────────────────
test('가져오기는 에셋만 추가(레이어 변화 0), 더블클릭은 레이어 1개', async ({ page }) => {
  await openApp(page);
  await openLeftProject(page);

  const layers0 = await page.evaluate(() => window.__store.get().order.length);
  // createImageBitmap 이 디코드할 수 있는 진짜 RGBA PNG 를 화면에서 만든다(1비트 PNG 는 헤드리스에서 0×0).
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#e06c6c'; ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('.project-panel input[type="file"]').first()
    .setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => Object.keys(window.__store.get().assets ?? {}).length === 1);

  const after = await page.evaluate(() => ({
    layers: window.__store.get().order.length,
    assets: Object.keys(window.__store.get().assets ?? {}).length,
  }));
  expect(after.assets).toBe(1);
  expect(after.layers).toBe(layers0);   // 가져오기만으로 레이어가 저절로 생기지 않는다

  await page.locator('.asset-row').first().dblclick();
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.__store.get().order.length)).toBe(layers0 + 1);
});

test('화면에 이미지 파일을 바로 놓으면 에셋 1 + 레이어 1', async ({ page }) => {
  await openApp(page);
  const base = await page.evaluate(() => ({
    layers: window.__store.get().order.length,
    assets: Object.keys(window.__store.get().assets ?? {}).length,
  }));
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#6cc06c'; ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'drop.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    const cv = document.querySelector('.stage-overlay');
    const r = cv.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, dataTransfer: dt };
    cv.dispatchEvent(new DragEvent('dragover', o));
    cv.dispatchEvent(new DragEvent('drop', o));
  });
  await page.waitForFunction((b) =>
    window.__store.get().order.length === b.layers + 1 &&
    Object.keys(window.__store.get().assets ?? {}).length === b.assets + 1, base);
});

// ── 5. 효과 컨트롤 줄 ────────────────────────────────────────────────────────
test('효과 컨트롤: 빛무리 파라미터 한 줄·정렬, 섞기 줄에 시계', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '네모' });
    l.shape = { kind: 'rect', w: 120, h: 120, fill: '#ffffff', stroke: null };
    l.transform.x.value = 100; l.transform.y.value = 100;
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__store.apply({ type: 'addFx', id: l.id, effectId: 'glow' });
    window.__editorState.set({ selection: [l.id] });
  });
  await page.locator('.panel-dock-right .panel-tab', { hasText: '효과 컨트롤' }).click();
  await expect(page.locator('.fx-card')).toHaveCount(1);

  // 파라미터 줄마다 높이 ≤ 32(세 줄로 쪼개지지 않는다).
  const rows = page.locator('.fx-card .effect-params .prop-row:visible');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = await rows.nth(i).boundingBox();
    expect(b.height, `파라미터 줄 ${i} 높이`).toBeLessThanOrEqual(32);
  }

  // 슬라이더 줄: 이름·슬라이더·숫자 칸의 세로 가운데가 ±4px 안.
  const sf = page.locator('.fx-card .effect-params .slider-field:visible').first();
  const lb = await sf.locator('.num-label').boundingBox();
  const sl = await sf.locator('.slider-range').boundingBox();
  const nu = await sf.locator('.num-input').boundingBox();
  const cy = (b) => b.y + b.height / 2;
  expect(Math.abs(cy(lb) - cy(sl))).toBeLessThanOrEqual(4);
  expect(Math.abs(cy(lb) - cy(nu))).toBeLessThanOrEqual(4);

  // 섞기(mix) 줄에 시계 버튼(키 가능 값).
  const mixRow = page.locator('.fx-card-body .prop-row', { has: page.locator('.num-label', { hasText: '섞기' }) });
  await expect(mixRow.locator('.kt-clock')).toHaveCount(1);
});

// ── 6. 작은 정리 ────────────────────────────────────────────────────────────
test('화면 아래 줄 라벨 한 줄, 화면 위 보기 버튼·배율 표시 없음', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.stage-view-btn')).toHaveCount(0);
  await expect(page.locator('.stage-zoom')).toHaveCount(0);
  const labels = page.locator('.stage-bottombar .bb-label');
  const n = await labels.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = await labels.nth(i).boundingBox();
    expect(b.height, `아래 줄 라벨 ${i} 높이(줄바꿈)`).toBeLessThanOrEqual(20);
  }
});
