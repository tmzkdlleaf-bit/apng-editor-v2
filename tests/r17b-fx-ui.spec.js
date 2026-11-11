// R17b — 레이어 효과 쌓기 UI(속성 패널 "효과" 섹션)·타임라인 라벨.
import { test, expect } from './helpers/fixtures.js';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
  // R23b: 효과 쌓기·효과 레이어 파라미터는 오른쪽 "효과 컨트롤" 탭으로 옮겼다.
  await page.locator('.panel-dock-right .panel-tab', { hasText: '효과 컨트롤' }).click();
}
async function addShape(page) {
  return page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '네모' });
    l.shape = { kind: 'rect', w: 60, h: 60, fill: '#ff8800', stroke: null };
    l.transform.x.value = 120; l.transform.y.value = 120;
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  });
}
function fxSec(page) { return page.locator('.inspector-section:has(.fx-stack-list)'); }

test('R17b — 도형 선택 시 "효과" 섹션 + [+ 효과], addFx 하면 카드 생성', async ({ page }) => {
  await openApp(page);
  await addShape(page);
  await page.waitForTimeout(80);
  const sec = fxSec(page);
  await expect(sec).toBeVisible();
  await expect(sec.getByRole('button', { name: '+ 효과' })).toBeVisible();

  const id = await page.evaluate(() => window.__editorState.get().selection[0]);
  await page.evaluate((i) => window.__store.apply({ type: 'addFx', id: i, effectId: 'glow', fxId: 'fx_g' }), id);
  await page.waitForTimeout(80);
  await expect(page.locator('.fx-card')).toHaveCount(1);
  await expect(page.locator('.fx-card .fx-card-name')).toHaveText('빛무리');
});

test('R17b — 효과 레이어(effect)에는 쌓기 섹션이 안 보인다', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('effect', { name: 'fx', effectId: 'glow' });
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  });
  await page.waitForTimeout(80);
  await expect(fxSec(page)).toBeHidden();
});

test('R17b — 카드 조작: 켜기/끄기·복제·삭제·순서·clip', async ({ page }) => {
  await openApp(page);
  const id = await addShape(page);
  await page.evaluate((i) => {
    window.__store.apply({ type: 'addFx', id: i, effectId: 'glow', fxId: 'fx_g' });
    window.__store.apply({ type: 'addFx', id: i, effectId: 'chromatic', fxId: 'fx_c' });
  }, id);
  await page.waitForTimeout(80);
  await expect(page.locator('.fx-card')).toHaveCount(2);

  const first = page.locator('.fx-card').first();
  // 끄기
  await first.locator('.fx-enable').uncheck();
  await page.waitForTimeout(40);
  expect(await page.evaluate((i) => window.__store.get().layers[i].fx.fx_g.enabled, id)).toBe(false);

  // clip 끄기(glow 카드의 유일한 .fx-check = 레이어 모양 안에서만)
  await first.locator('.fx-check input').uncheck();
  await page.waitForTimeout(40);
  expect(await page.evaluate((i) => window.__store.get().layers[i].fx.fx_g.clip, id)).toBe(false);

  // 아래로(순서) → fxOrder [fx_c, fx_g]
  await first.locator('button[title="아래로"]').click();
  await page.waitForTimeout(40);
  expect(await page.evaluate((i) => window.__store.get().layers[i].fxOrder.join(), id)).toBe('fx_c,fx_g');

  // 복제 → 3개
  await page.locator('.fx-card').first().locator('button[title="복제"]').click();
  await page.waitForTimeout(40);
  await expect(page.locator('.fx-card')).toHaveCount(3);

  // 삭제 → 2개
  await page.locator('.fx-card').first().locator('button[title="삭제"]').click();
  await page.waitForTimeout(40);
  await expect(page.locator('.fx-card')).toHaveCount(2);
});

test('R17b — 카드 파라미터에 시계 버튼; 클릭하면 fx.<id>.paramAnim 키 생성', async ({ page }) => {
  await openApp(page);
  const id = await addShape(page);
  await page.evaluate((i) => window.__store.apply({ type: 'addFx', id: i, effectId: 'glow', fxId: 'fx_g' }), id);
  await page.waitForTimeout(80);
  const card = page.locator('.fx-card').first();
  await expect(card.locator('.kt-clock').first()).toBeVisible();
  await expect(card.locator('.slider-range').first()).toBeVisible(); // 섞기/파라미터 슬라이더
  // 첫 파라미터의 시계 켜기
  await card.locator('.kt-clock').first().click();
  await page.waitForTimeout(40);
  const anyKey = await page.evaluate((i) => {
    const fx = window.__store.get().layers[i].fx.fx_g;
    return Object.keys(fx.paramAnim || {}).some((k) => fx.paramAnim[k]?.keys?.length);
  }, id);
  expect(anyKey).toBe(true);
});

test('R17b — 타임라인 animatedProps 에 fx 파라미터(효과이름 › 파라미터)', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { animatedProps } = await import('/src/ui/timeline/rows.js');
    const layer = {
      type: 'shape', fxOrder: ['fx_g'],
      fx: { fx_g: { effectId: 'glow', enabled: true, paramAnim: { intensity: { keys: [{ f: 0, v: 0 }, { f: 10, v: 1 }] } }, mix: { value: 1, keys: [{ f: 0, v: 0 }, { f: 5, v: 1 }] } } },
      transform: { x: { value: 0 }, y: { value: 0 }, scale: { value: 1 }, rotation: { value: 0 }, alpha: { value: 1 } },
    };
    const ap = animatedProps(layer);
    return ap.map((p) => ({ path: p.path, label: p.label }));
  });
  const intensity = r.find((p) => p.path === 'fx.fx_g.paramAnim.intensity');
  const mix = r.find((p) => p.path === 'fx.fx_g.mix');
  expect(intensity?.label).toBe('빛무리 › 세기');
  expect(mix?.label).toBe('빛무리 › 섞기');
});

test('R17b — 효과 레이어 파라미터 UI 는 공용 조각으로 그대로 동작(회귀)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const { getEffect } = await import('/src/effects/registry.js');
    const e = getEffect('glow');
    const params = {}; for (const p of e.params) params[p.key] = p.default;
    const l = createLayer('effect', { name: '빛무리', effectId: 'glow' });
    l.params = params;
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
  });
  await page.waitForTimeout(100);
  const sec = page.locator('.inspector-section', { hasText: '이펙트' });
  await expect(sec).toBeVisible();
  // glow: 슬라이더(radius·intensity)·색·좌표(2 숫자)·시계
  expect(await sec.locator('.slider-range').count()).toBeGreaterThanOrEqual(2);
  expect(await sec.locator('.color-field').count()).toBeGreaterThanOrEqual(1);
  expect(await sec.locator('.kt-clock').count()).toBeGreaterThanOrEqual(1);
});
