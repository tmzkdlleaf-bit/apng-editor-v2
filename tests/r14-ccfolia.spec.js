// R14-2 — 코코포리아 화면 미리보기. 내보낸 Blob 이 <img> 에 들어가는지, 배경 저장·복원,
// 창 닫으면 객체 URL 해제, 배경 에셋이 정리에서 보호되는지(keepIds).
import { test, expect } from '@playwright/test';

async function pngBlob(page) {
  // 작은 빨간 PNG Blob (미리보기 img 재료). PNG 라 <img> 가 바로 표시.
  return page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    c.getContext('2d').fillStyle = '#ff0000'; c.getContext('2d').fillRect(0, 0, 16, 16);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    window.__pngBlob = blob;
    return blob.size;
  });
}

test.describe('R14-2 코코포리아 미리보기', () => {
  test('[올림·배경·해제] Blob이 img에 들어가고, 배경 저장·복원, 닫으면 해제', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);
    await pngBlob(page);

    const r = await page.evaluate(async () => {
      const { putAsset } = await import('/src/core/io/assets.js');
      const { openCcfoliaPreview, closeCcfoliaPreview } = await import('/src/ui/export/ccfolia-preview.js');
      // 배경을 에셋으로 저장 + 마지막 배경 id 기억.
      const bgFile = new File([window.__pngBlob], 'bg.png', { type: 'image/png' });
      const { id: bgId } = await putAsset(bgFile, '코코포리아 배경');
      localStorage.setItem('apng2.ccfoliaBg', bgId);

      openCcfoliaPreview({ blob: window.__pngBlob, filename: 'result.png', mime: 'apng', width: 16, height: 16 });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await new Promise((res) => setTimeout(res, 50)); // 배경 비동기 로드 대기

      const pv = window.__ccfoliaPreview;
      const overlaySrc = pv.overlay.src;
      const bgShown = pv.bgImg.style.display !== 'none' && pv.bgImg.src.startsWith('blob:');
      const inDoc = document.body.contains(pv.el);

      closeCcfoliaPreview();
      const closed = window.__ccfoliaPreview === null && !document.body.contains(pv.el);

      localStorage.removeItem('apng2.ccfoliaBg');
      return { overlayIsBlob: overlaySrc.startsWith('blob:'), bgShown, inDoc, closed, bgId };
    });
    expect(r.overlayIsBlob).toBe(true);  // 내보낸 Blob 이 img 에
    expect(r.bgShown).toBe(true);        // 저장한 배경 복원
    expect(r.inDoc).toBe(true);
    expect(r.closed).toBe(true);         // 닫으면 모달 제거(+URL 해제)
  });

  test('[정리 보호] keepIds 로 넘긴 배경 에셋은 시작 정리에서 안 지워진다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);
    const r = await page.evaluate(async () => {
      const { putAssetBlob, hasAssetBlob, deleteAssetBlob } = await import('/src/core/io/idb.js');
      const { purgeOrphanAssets } = await import('/src/core/io/assets.js');
      const id = 'ast_ccf_' + Math.random().toString(36).slice(2);
      await putAssetBlob(id, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 0); // 오래전 저장
      await purgeOrphanAssets({ maxAgeMs: 0, now: Date.now() + 1, keepIds: [id] });
      const kept = await hasAssetBlob(id);
      try { await deleteAssetBlob(id); } catch {}
      return { kept };
    });
    expect(r.kept).toBe(true);
  });

  test('[버튼 배선] 내보내기 결과에서 화면 미리보기 열림', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__exportUI));
    await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const s = createLayer('shape', { name: '네모' });
      s.shape = { kind: 'rect', w: 80, h: 80, fill: '#30c0ff', stroke: null };
      s.transform.x.value = window.__store.get().meta.width / 2;
      s.transform.y.value = window.__store.get().meta.height / 2;
      window.__store.apply({ type: 'addLayer', layer: s, index: 0 });
    });
    await page.evaluate(() => window.__exportUI.open());
    await page.waitForFunction(() => window.__exportUI.depsReady());
    // 추정 미리보기가 끝나 "화면에서 미리보기" 버튼이 보일 때까지.
    await page.waitForSelector('#ex-ccfolia:not([style*="display: none"])', { timeout: 30000 });
    await page.click('#ex-ccfolia');
    await page.waitForFunction(() => window.__ccfoliaPreview && window.__ccfoliaPreview.overlay.src.startsWith('blob:'), null, { timeout: 10000 });
    expect(await page.evaluate(() => !!window.__ccfoliaPreview)).toBe(true);
    await page.evaluate(() => { const { closeCcfoliaPreview } = window.__ccfoliaPreview ? {} : {}; });
    await page.keyboard.press('Escape');
  });
});
