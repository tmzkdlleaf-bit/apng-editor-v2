// R23d 1부 — 화면 버그 수정 검증.
//   메뉴 가려짐·새 장면 창·아이콘 원/사각형·가져오기 자동 레이어·효과 컨트롤 줄·작은 정리.
import { test, expect } from './helpers/fixtures.js';
import { expectOnTop } from './helpers/on-top.js';

async function openApp(page, { width = 1440, height = 900, clearTl = false } = {}) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((ct) => {
    try { localStorage.setItem('apng2.onboarded', '1'); } catch {}
    if (ct) { try { localStorage.removeItem('apng2.timelineHeight'); } catch {} }
  }, clearTl);
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  await page.waitForTimeout(150);
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

// ── 2부(10) 처음 화면 맞추기 ─────────────────────────────────────────────────
test('1280×720 새 프로젝트: 그림판이 칸 안에 다 들어가고 배율 ≤ 100%, 256 문서는 100%', async ({ page }) => {
  await openApp(page, { width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const es = window.__editorState.get();
    const m = window.__store.get().meta;
    const region = document.querySelector('[data-region="canvas"]').getBoundingClientRect();
    return { zoom: es.zoom, docW: m.width, docH: m.height, rw: region.width, rh: region.height };
  });
  expect(r.zoom).toBeLessThanOrEqual(1.001);                 // 100%보다 크게 키우지 않음
  expect(r.docW * r.zoom).toBeLessThanOrEqual(r.rw + 1);     // 그림판이 가로 칸 안
  expect(r.docH * r.zoom).toBeLessThanOrEqual(r.rh + 1);     // 그림판이 세로 칸 안

  // 256×256 로 바꾸면(문서 크기 변경 → 다시 맞춤) 작은 문서라 100%.
  await page.evaluate(() => window.__store.apply({ type: 'setMeta', patch: { width: 256, height: 256 } }));
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.__editorState.get().zoom)).toBeCloseTo(1, 2);
});

test('직접 확대한 뒤 창 크기를 바꿔도 배율이 그대로', async ({ page }) => {
  await openApp(page, { width: 1280, height: 720 });
  // 화면 아래 줄 배율 입력으로 200% (직접 조작 → viewUserAdjusted).
  const zi = page.locator('.stage-bottombar .bb-zoom-input');
  await zi.fill('200'); await zi.press('Enter');
  expect(await page.evaluate(() => window.__editorState.get().zoom)).toBeCloseTo(2, 2);
  await page.setViewportSize({ width: 1000, height: 640 });   // 창 크기 변경(리사이즈)
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__editorState.get().zoom)).toBeCloseTo(2, 2); // 안 건드림
});

// ── 2부(11) 타임라인 높이 / 겹친 표시 ────────────────────────────────────────
test('저장값 없음 + 1280×720: 타임라인 ≤ 창 32%, 그림판 ≥ 280, 더블클릭 → 기본', async ({ page }) => {
  await openApp(page, { width: 1280, height: 720, clearTl: true });
  const tlH = () => page.evaluate(() => document.querySelector('[data-region="timeline"]').getBoundingClientRect().height);
  const stageH = () => page.evaluate(() => document.querySelector('[data-region="canvas"]').getBoundingClientRect().height);
  expect(await tlH()).toBeLessThanOrEqual(720 * 0.32 + 2);
  expect(await stageH()).toBeGreaterThanOrEqual(280);

  // 저장값을 크게 넣고 다시 열면 그림판 최소(280) 지키려 줄어든다(저장값은 안 바뀜).
  await page.evaluate(() => { try { localStorage.setItem('apng2.timelineHeight', '560'); } catch {} });
  await page.reload();
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
  expect(await stageH()).toBeGreaterThanOrEqual(280);
  // 경계 더블클릭 → 기본 높이(저장값 지움)로.
  await page.locator('#tl-resize').dblclick();
  await page.waitForTimeout(80);
  expect(await tlH()).toBeLessThanOrEqual(720 * 0.32 + 2);
});

test('화면 아래 줄에 프레임 위치 0개, 배율 표시 화면 전체에 1개', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.stage-bottombar .bb-frame-text')).toHaveCount(0);
  await expect(page.locator('.bb-zoom-num')).toHaveCount(0);
  await expect(page.locator('.stage-zoom')).toHaveCount(0);
  // 확대 배율을 보여주는 칸은 화면 전체에서 하나(아래 줄 배율 입력).
  await expect(page.locator('.bb-zoom-input')).toHaveCount(1);
});

// R23d-3: 아래 줄 드롭다운(해상도·격자 간격)이 칸 밖으로 나가 옆 체크박스를 덮던 문제.
for (const width of [1440, 1280, 1024]) {
  test(`화면 아래 줄 요소끼리 겹침 0 (${width})`, async ({ page }) => {
    await openApp(page, { width, height: 800 });
    const overlaps = await page.evaluate(() => {
      const bar = document.querySelector('.stage-bottombar');
      const els = [...bar.querySelectorAll('button, input, label, .bb-label')]
        .filter((e) => e.getBoundingClientRect().width > 2);
      const out = [];
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
          const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (ox > 1 && oy > 1) out.push(`${els[i].className || els[i].tagName} x ${els[j].className || els[j].tagName}`);
        }
      }
      return out;
    });
    expect(overlaps).toEqual([]);
  });
}
