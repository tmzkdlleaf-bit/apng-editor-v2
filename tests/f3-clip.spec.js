// F3-3 — 클립: 자르기(프레임별 동일)·복제·삭제(원래값)·루프 토글.
import { test, expect } from '@playwright/test';

test('F3-3 — 클립 자르기: 두 조각 합친 결과가 자르기 전과 프레임별 동일', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { createStore } = await import('/src/core/doc/store.js');
    const { createDoc, createLayer, createClip } = await import('/src/core/doc/schema.js');
    const { evalTransform } = await import('/src/core/anim/evaluate.js');
    const motions = (await import('/src/motions/registry.js')).default;

    const doc = createDoc({ width: 100, height: 100, fps: 12, frameCount: 24 });
    const L = createLayer('shape', { name: 'S' });
    L.transform.x.value = 50; L.transform.y.value = 50;
    // 비루프 클립(페이드 인 대신 흔들기? 비루프로: 위아래 둥실을 loop=false 로)
    const clip = createClip(motions.get('test-float'), { start: 4, length: 16 });
    clip.loop = false;
    L.clips = [clip];
    doc.layers[L.id] = L; doc.order.push(L.id);
    const store = createStore(doc);

    const sample = () => {
      const out = [];
      for (let f = 0; f < 24; f++) out.push(evalTransform(store.get(), L.id, f, motions).y);
      return out;
    };
    const before = sample();
    // f=10 에서 자르기
    store.apply({ type: 'splitClip', id: L.id, clipId: clip.id, f: 10 });
    const clips = store.get().layers[L.id].clips;
    const after = sample();

    let maxDiff = 0;
    for (let f = 0; f < 24; f++) maxDiff = Math.max(maxDiff, Math.abs(before[f] - after[f]));
    return { clipCount: clips.length, maxDiff };
  });
  expect(r.clipCount).toBe(2);           // 둘로 나뉨
  expect(r.maxDiff).toBeLessThan(1e-6);  // 프레임별 동일
});

test('F3-3 — 클립 삭제 → 값 원래대로, 복제 → 클립 +1', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { createStore } = await import('/src/core/doc/store.js');
    const { createDoc, createLayer, createClip } = await import('/src/core/doc/schema.js');
    const { evalTransform } = await import('/src/core/anim/evaluate.js');
    const motions = (await import('/src/motions/registry.js')).default;

    const doc = createDoc({ width: 100, height: 100, fps: 12, frameCount: 24 });
    const L = createLayer('shape', { name: 'S' });
    L.transform.x.value = 50; L.transform.y.value = 50;
    doc.layers[L.id] = L; doc.order.push(L.id);
    const store = createStore(doc);

    const baseY = evalTransform(store.get(), L.id, 8, motions).y; // 클립 없을 때
    const clip = createClip(motions.get('test-float'), { start: 0, length: 24 });
    store.apply({ type: 'addLayer', layer: L, index: 0 }); // 이미 있음 — no-op 방지 위해 addClip만
    store.apply({ type: 'addClip', id: L.id, clip });
    const withClipY = evalTransform(store.get(), L.id, 8, motions).y;

    store.apply({ type: 'duplicateClip', id: L.id, clipId: clip.id });
    const dupCount = store.get().layers[L.id].clips.length;

    // 둘 다 삭제 → 원래 값
    for (const c of [...store.get().layers[L.id].clips]) store.apply({ type: 'removeClip', id: L.id, clipId: c.id });
    const afterDelY = evalTransform(store.get(), L.id, 8, motions).y;

    return { baseY, withClipY, dupCount, afterDelY };
  });
  expect(r.withClipY).not.toBeCloseTo(r.baseY, 3); // 클립이 값에 영향
  expect(r.dupCount).toBe(2);
  expect(r.afterDelY).toBeCloseTo(r.baseY, 6);     // 삭제 후 원래값 복원
});

test('F3-3 — 루프 토글: setClip loop', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  const r = await page.evaluate(async () => {
    const { createClip } = await import('/src/core/doc/schema.js');
    const motions = (await import('/src/motions/registry.js')).default;
    const doc = window.__store.get();
    const id = doc.order.find((x) => doc.layers[x]?.type === 'shape');
    const clip = createClip(motions.get('test-shake'), { start: 0 });
    clip.loop = false;
    window.__store.apply({ type: 'addClip', id, clip });
    window.__store.apply({ type: 'setClip', id, clipId: clip.id, patch: { loop: true } });
    const c = window.__store.get().layers[id].clips.find((x) => x.id === clip.id);
    return { loop: c.loop };
  });
  expect(r.loop).toBe(true);
});
