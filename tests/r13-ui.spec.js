// R13 UI — 내보내기 창에서 PNG 묶음 형식 선택→zip 저장, 세트 탭에서 변형 내보내기.
import { test, expect } from '@playwright/test';

async function addShape(page) {
  await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const s = createLayer('shape', { name: '네모' });
    s.shape = { kind: 'rect', w: 60, h: 60, fill: '#30a0ff', stroke: null };
    s.transform.x.value = window.__store.get().meta.width / 2;
    s.transform.y.value = window.__store.get().meta.height / 2;
    window.__store.apply({ type: 'addLayer', layer: s, index: 0 });
    window.__shapeId = s.id;
  });
}

test.describe('R13 UI', () => {
  test('[R13-2] PNG 묶음 형식 선택 → zip 저장', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__exportUI));
    await addShape(page);

    await page.evaluate(() => window.__exportUI.open());
    await page.waitForFunction(() => window.__exportUI.depsReady());

    await page.click('.ex-seg-btn[data-format="png-seq"]');
    await expect(page.locator('.ex-seg-btn[data-format="png-seq"]')).toHaveClass(/is-on/);

    await page.evaluate(() => { window.__lastExport = null; });
    await page.click('#ex-run');
    await page.waitForFunction(() => window.__lastExport && window.__lastExport.bytes > 0, null, { timeout: 30000 });
    const r = await page.evaluate(() => window.__lastExport);
    expect(r.filename.endsWith('.zip')).toBe(true);
    expect(r.mime).toBe('application/zip');
  });

  test('[R13-1] 세트 탭에서 색 변형 2개 → zip 2파일', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__exportUI));
    await addShape(page);

    // 세트 정의를 심어 둔다(도형 채움색 슬롯 + 변형 2개).
    await page.evaluate(() => {
      const id = window.__shapeId;
      window.__store.apply({ type: 'setVariants', variants: {
        slots: [{ id: 's_c', layerId: id, kind: 'color', label: '네모 색' }],
        rows: [
          { id: 'r1', name: '빨강', values: { s_c: '#ff0000' } },
          { id: 'r2', name: '초록', values: { s_c: '#00ff00' } },
        ],
      } });
    });

    await page.evaluate(() => window.__exportUI.open());
    await page.waitForFunction(() => window.__exportUI.depsReady());
    // 목표 용량 없는 형식으로(빠르게) — PNG 묶음 대신 APNG 기본이면 목표 맞추기가 돈다. 색 유지로도 충분하지만
    // 안정적으로 archive(무손실·목표없음) 대신 형식만 apng 로 두고 세트 탭으로.
    await page.click('.ex-tab[data-tab="set"]');
    await expect(page.locator('.ex-set .set-table')).toBeVisible();

    // 미리보기 토글이 editorState 를 바꾸는지(문서 미리보기).
    await page.click('.ex-set .set-row-acts button:has-text("이 변형으로 미리보기")');
    const pv = await page.evaluate(() => window.__editorState.get().previewVariantId);
    expect(pv).toBeTruthy();

    await page.evaluate(() => { window.__lastSetExport = null; });
    await page.click('.ex-set .set-foot button.accent');
    await page.waitForFunction(() => window.__lastSetExport && window.__lastSetExport.count === 2, null, { timeout: 60000 });
    const r = await page.evaluate(() => window.__lastSetExport);
    expect(r.count).toBe(2);
    expect(r.filename.endsWith('.zip')).toBe(true);

    // 창을 닫으면 미리보기가 꺼진다.
    await page.evaluate(() => window.__exportUI.close());
    expect(await page.evaluate(() => window.__editorState.get().previewVariantId)).toBe(null);
  });
});
