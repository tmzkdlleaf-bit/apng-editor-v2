// R10 — 큰 GIF 줄여 가져오기 · 움직이는 이미지 이음새 · 타자기 이음새.
import { test, expect } from './helpers/fixtures.js';

test.describe('R10-1 큰 GIF 줄여 가져오기', () => {
  test('[줄이기] 기준 안으로 + 전체 길이 유지', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { encode } = await import('/src/export/encode.js');
      const { probeAnim } = await import('/src/core/io/anim-decode.js');
      const { reduceAnim, planReduce } = await import('/src/ui/anim-reduce.js');

      // 테스트용 GIF 만들기: 움직이는 도형 80×80×8.
      const doc = H.movingShapeDoc({ width: 80, height: 80, fps: 10, frameCount: 8, x0: 10, x1: 70 });
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(eng, doc, { createCanvas: H.createCanvas });
      const { buf } = await encode(baked, 'gif', { loops: 0 }, {});
      const blob = new Blob([buf], { type: 'image/gif' });
      const probe = await probeAnim(blob);
      const meta = { width: 80, height: 80, frameCount: probe.frameCount, delays: probe.delays, durationMs: probe.durationMs };

      const limit = 50000; // 강제로 줄이게 작은 기준
      const plan = planReduce(meta, limit);
      const out = await reduceAnim(blob, meta, { limit });
      const outBytes = out.width * out.height * 4 * out.frameCount;
      return {
        origDuration: meta.durationMs, origFrames: meta.frameCount,
        outW: out.width, outH: out.height, outFrames: out.frameCount, outDuration: out.durationMs,
        outBytes, limit, planFrames: plan.newFrameCount,
        oneFrame: meta.durationMs / meta.frameCount,
      };
    });
    expect(r.outBytes).toBeLessThanOrEqual(r.limit);             // 기준 안
    expect(r.outFrames).toBeLessThanOrEqual(r.origFrames);       // 프레임 줄거나 같음
    expect(Math.abs(r.outDuration - r.origDuration)).toBeLessThanOrEqual(r.oneFrame + 1); // 전체 길이 유지(±1프레임)
  });
});

test.describe('R10-2 움직이는 이미지 이음새', () => {
  test('[경고+맞추기] 문서 2초·GIF 0.7초 → 경고, 맞추면 사라짐, 되돌리기 1건', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);
    const r = await page.evaluate(async () => {
      const { createStore } = await import('/src/core/doc/store.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { checkLoopSeam, animSeamFix } = await import('/src/core/anim/seam.js');
      const motions = (await import('/src/motions/registry.js')).default;

      const doc = createDoc({ width: 80, height: 80, fps: 10, frameCount: 20 }); // 2.0초
      const l = createLayer('anim', { name: '움직임', assetId: 'a1' });
      l.timing = { mode: 'loop', speed: 1, offset: 0 };
      doc.layers[l.id] = l; doc.order.push(l.id);
      doc.assets.a1 = { width: 80, height: 80, animated: true, frameCount: 7, delays: [100, 100, 100, 100, 100, 100, 100], durationMs: 700 };

      const store = createStore(doc);
      const before = checkLoopSeam(store.get(), motions).filter((i) => i.kind === 'anim');
      const fix = animSeamFix(store.get(), l.id);
      const depth0 = store.undoDepth();
      store.apply({ type: 'setMeta', patch: { frameCount: fix.frameCount } });
      const after = checkLoopSeam(store.get(), motions).filter((i) => i.kind === 'anim');
      const depthDelta = store.undoDepth() - depth0;
      store.undo();
      return { beforeN: before.length, fixFrameCount: fix.frameCount, afterN: after.length, depthDelta, restored: store.get().meta.frameCount };
    });
    expect(r.beforeN).toBeGreaterThanOrEqual(1); // 경고 있음
    expect(r.fixFrameCount).toBe(21);            // 2.1초(0.7×3)
    expect(r.afterN).toBe(0);                    // 맞춘 뒤 경고 사라짐
    expect(r.depthDelta).toBe(1);                // 되돌리기 1건
    expect(r.restored).toBe(20);                 // 되돌리기 1번에 원래대로
  });

  test('[UI] 루프 검사 창에 맞추기 버튼 → frameCount 바뀜', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__editorState));
    await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const l = createLayer('anim', { name: '움직임', assetId: 'a1' });
      l.timing = { mode: 'loop', speed: 1, offset: 0 };
      window.__store.apply({ type: 'setMeta', patch: { fps: 10, frameCount: 20 } });
      window.__store.apply({ type: 'batch', cmds: [
        { type: 'addAsset', id: 'a1', asset: { width: 80, height: 80, animated: true, frameCount: 7, delays: [100, 100, 100, 100, 100, 100, 100], durationMs: 700 } },
        { type: 'addLayer', layer: l, index: 0 },
      ] });
    });
    await page.evaluate(async () => {
      const { openLoopCheck } = await import('/src/ui/loop-check.js');
      openLoopCheck(window.__store, window.__editorState);
    });
    const fixBtn = page.locator('.lc-fix');
    await expect(fixBtn).toBeVisible();
    await fixBtn.click();
    const fc = await page.evaluate(() => window.__store.get().meta.frameCount);
    expect(fc).toBe(21);
  });
});

test.describe('R10-3 타자기 이음새', () => {
  test('[경고] once 타자기 → 경고, loop 로 0·N 맞으면 없음', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { checkLoopSeam } = await import('/src/core/anim/seam.js');
      const motions = (await import('/src/motions/registry.js')).default;

      const doc = createDoc({ width: 80, height: 80, fps: 12, frameCount: 24 });
      const t = createLayer('text', { name: '타자', text: '안녕하세요' });
      t.reveal = { startF: 0, endF: 23, loop: 'once', mode: 'char' };
      doc.layers[t.id] = t; doc.order.push(t.id);
      const once = checkLoopSeam(doc, motions).filter((i) => i.kind === 'text');

      // loop 로 바꾸고 주기를 문서 길이에 맞추면(0과 N 동일) 경고 없음.
      doc.layers[t.id].reveal = { startF: 0, endF: 24, loop: 'loop', mode: 'char' };
      const loop = checkLoopSeam(doc, motions).filter((i) => i.kind === 'text');
      return { onceN: once.length, loopN: loop.length };
    });
    expect(r.onceN).toBeGreaterThanOrEqual(1); // once → 경고
    expect(r.loopN).toBe(0);                   // loop·정렬 → 경고 없음
  });
});
