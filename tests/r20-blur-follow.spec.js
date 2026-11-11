// R20 — 월드 변환 통합·따라가기(follow)·움직임 번짐(motion blur).
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

// ── B. 따라가기 ───────────────────────────────────────────────────────────
test('따라가기: 대상이 오른쪽 100 이동 → 자식 월드도 100 이동', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { worldTr } = await import('/src/core/anim/world.js');
    const doc = createDoc();
    const b = createLayer('shape', { name: 'B' }); b.transform.x.value = 0; b.transform.y.value = 0;
    const a = createLayer('shape', { name: 'A' }); a.transform.x.value = 50; a.transform.y.value = 0; a.followId = b.id;
    doc.layers[a.id] = a; doc.layers[b.id] = b; doc.order.push(b.id, a.id);
    const w0 = worldTr(doc, a.id, 0);
    b.transform.x.value = 100;
    const w1 = worldTr(doc, a.id, 0);
    return { dx: w1.x - w0.x, y: w1.y - w0.y };
  });
  expect(Math.abs(r.dx - 100)).toBeLessThan(1e-6);
  expect(Math.abs(r.y)).toBeLessThan(1e-6);
});

test('따라가기: 대상 90도 회전 → 자식이 대상 기준점 둘레로 돈다', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { worldTr } = await import('/src/core/anim/world.js');
    const doc = createDoc();
    const b = createLayer('shape', { name: 'B' }); b.transform.x.value = 0; b.transform.y.value = 0;
    const a = createLayer('shape', { name: 'A' }); a.transform.x.value = 50; a.transform.y.value = 0; a.followId = b.id;
    doc.layers[a.id] = a; doc.layers[b.id] = b; doc.order.push(b.id, a.id);
    b.transform.rotation.value = 90;
    const w = worldTr(doc, a.id, 0);
    return { x: w.x, y: w.y, rot: w.rotation };
  });
  expect(Math.abs(r.x)).toBeLessThan(0.5);      // (50,0) 이 90도 회전 → (0,50)
  expect(Math.abs(r.y - 50)).toBeLessThan(0.5);
  expect(Math.abs(r.rot - 90)).toBeLessThan(1e-6);
});

test('keepPlace: 연결·해제 순간 화면 위치가 같다 (0.5px 이하)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { worldTr } = await import('/src/core/anim/world.js');
    const doc = createDoc();
    const b = createLayer('shape', { name: 'B' });
    b.transform.x.value = 120; b.transform.y.value = 40; b.transform.rotation.value = 30; b.transform.scale.value = 1.5;
    const a = createLayer('shape', { name: 'A' }); a.transform.x.value = 200; a.transform.y.value = 300;
    doc.layers[a.id] = a; doc.layers[b.id] = b; doc.order.push(b.id, a.id);
    const store = createStore(doc);
    const before = worldTr(store.get(), a.id, 0);
    store.apply({ type: 'setFollow', id: a.id, targetId: b.id, keepPlace: true, f: 0 });
    const afterConnect = worldTr(store.get(), a.id, 0);
    store.apply({ type: 'setFollow', id: a.id, targetId: null, keepPlace: true, f: 0 });
    const afterOff = worldTr(store.get(), a.id, 0);
    const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    return { connectDist: d(before, afterConnect), offDist: d(before, afterOff), followId: store.get().layers[a.id].followId };
  });
  expect(r.connectDist).toBeLessThan(0.5);
  expect(r.offDist).toBeLessThan(0.5);
  expect(r.followId).toBeNull();
});

test('순환 연결 거부·대상 삭제 시 해제+위치 유지·복제 시 id 바뀜', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { worldTr } = await import('/src/core/anim/world.js');
    const doc = createDoc();
    const b = createLayer('shape', { name: 'B' }); b.transform.x.value = 100;
    const a = createLayer('shape', { name: 'A' }); a.transform.x.value = 50;
    doc.layers[a.id] = a; doc.layers[b.id] = b; doc.order.push(b.id, a.id);
    const store = createStore(doc);
    // A→B 연결 후 B→A 는 순환이라 거부
    store.apply({ type: 'setFollow', id: a.id, targetId: b.id });
    store.apply({ type: 'setFollow', id: b.id, targetId: a.id });
    const cycleRejected = store.get().layers[b.id].followId === null;
    // 대상 삭제 → A 해제 + 위치 유지
    const beforeDel = worldTr(store.get(), a.id, 0);
    store.apply({ type: 'removeLayers', ids: [b.id] });
    const afterDel = worldTr(store.get(), a.id, 0);
    const released = store.get().layers[a.id].followId === null;
    const keptPos = Math.hypot(beforeDel.x - afterDel.x, beforeDel.y - afterDel.y) < 0.5;
    // 복제: 두 레이어를 함께 복제 → 복제본 A 의 followId 가 복제본 B 를 가리킨다
    const c = createLayer('shape', { name: 'C' });
    const d2 = createLayer('shape', { name: 'D' }); d2.followId = c.id;
    store.apply({ type: 'addLayer', layer: c });
    store.apply({ type: 'addLayer', layer: d2 });
    const patches = store.apply({ type: 'duplicateLayers', ids: [c.id, d2.id] });
    const newIds = patches.filter(p => p.path.length === 2 && p.path[0] === 'layers' && p.before === undefined).map(p => p.path[1]);
    const dupD = newIds.map(i => store.get().layers[i]).find(l => l && l.name?.startsWith('D'));
    const remapped = dupD && dupD.followId && dupD.followId !== c.id && newIds.includes(dupD.followId);
    return { cycleRejected, released, keptPos, remapped: !!remapped };
  });
  expect(r.cycleRejected).toBe(true);
  expect(r.released).toBe(true);
  expect(r.keptPos).toBe(true);
  expect(r.remapped).toBe(true);
});

// ── C. 움직임 번짐 ─────────────────────────────────────────────────────────
function _renderSetup() {
  // 공용: 64x64, 가운데 세로 10px 사각형, x 로 빠르게 지나감.
  return async ({ blurOn, layerBlur, moving, quality, samples }) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 10 });
    doc.meta.motionBlur = { on: !!blurOn, shutter: 180, phase: -90, samples: samples ?? 8 };
    const s = createLayer('shape', { name: 's' });
    s.shape = { kind: 'rect', w: 10, h: 40, fill: '#ffffff', stroke: null };
    s.motionBlur = !!layerBlur;
    if (moving) s.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 400, ease: 'linear' }] }; // 40px/frame
    else s.transform.x = { value: 32 };
    s.transform.y = { value: 32 };
    doc.layers[s.id] = s; doc.order.push(s.id);
    // 이동 레이어는 f=1 쯤(x=40) 에서 화면 안
    const f = moving ? 1 : 0;
    const eng = createRenderEngine({ createCanvas: mk });
    const c = mk(64, 64); const ctx = c.getContext('2d');
    eng.renderFrame(ctx, doc, f, { quality: quality ?? 'final' });
    const data = ctx.getImageData(0, 0, 64, 64).data;
    // 세로 중앙 줄(y=32)에서 alpha>0 열 수, 부분투명(0<a<250) 열 수
    let covered = 0, partial = 0;
    for (let x = 0; x < 64; x++) {
      const a = data[(32 * 64 + x) * 4 + 3];
      if (a > 0) covered++;
      if (a > 0 && a < 250) partial++;
    }
    return { covered, partial, data: Array.from(data) };
  };
}

test('번짐: 빠른 사각형은 덮는 폭이 이동거리×shutter/360 만큼 넓어지고 반투명 가장자리가 생긴다', async ({ page }) => {
  const r = await page.evaluate(async (setupSrc) => {
    const setup = (new Function('return ' + setupSrc))();
    const off = await setup({ blurOn: false, layerBlur: true, moving: true });
    const on  = await setup({ blurOn: true,  layerBlur: true, moving: true });
    return { offCov: off.covered, onCov: on.covered, onPartial: on.partial, offPartial: off.partial };
  }, _renderSetup().toString());
  // 40px/frame × 180/360 = 20px 번짐. 덮는 폭이 그만큼 넓어짐(표본·안티앨리어싱 오차 허용).
  expect(r.onCov - r.offCov).toBeGreaterThan(12);
  expect(r.onCov - r.offCov).toBeLessThan(30);
  expect(r.onPartial).toBeGreaterThan(r.offPartial); // 반투명 가장자리
});

test('번짐: 멈춘 레이어는 번짐 없음 = 픽셀 동일, 문서 스위치 끔 = 픽셀 동일', async ({ page }) => {
  const r = await page.evaluate(async (setupSrc) => {
    const setup = (new Function('return ' + setupSrc))();
    const eq = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const staticOff = await setup({ blurOn: false, layerBlur: true, moving: false });
    const staticOn  = await setup({ blurOn: true,  layerBlur: true, moving: false });
    const movingDocOff = await setup({ blurOn: false, layerBlur: true, moving: true });
    const movingLayerOff = await setup({ blurOn: true, layerBlur: false, moving: true });
    return { staticSame: eq(staticOff.data, staticOn.data), docOffSame: eq(movingDocOff.data, movingLayerOff.data) };
  }, _renderSetup().toString());
  expect(r.staticSame).toBe(true);  // 멈춤 → 번짐 영향 없음
  expect(r.docOffSame).toBe(true);  // 한쪽 스위치만 → 기존과 동일
});

test('번짐: 반복 문서에서 f0 결과와 f=frameCount 결과가 같다(이음새)', async ({ page }) => {
  const same = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 10 });
    doc.meta.playback = 'loop';
    doc.meta.motionBlur = { on: true, shutter: 180, phase: -90, samples: 8 };
    const s = createLayer('shape', { name: 's' });
    s.shape = { kind: 'rect', w: 10, h: 40, fill: '#ffffff', stroke: null };
    s.motionBlur = true;
    // 루프 안전한 왕복: f0 와 fN 에서 같은 위치·같은 속도(사인)
    s.transform.x = { value: 32, keys: [{ f: 0, v: 32, ease: 'linear' }, { f: 5, v: 40, ease: 'linear' }, { f: 10, v: 32, ease: 'linear' }] };
    s.transform.y = { value: 32 };
    doc.layers[s.id] = s; doc.order.push(s.id);
    const eng = createRenderEngine({ createCanvas: mk });
    const render = (f) => { const c = mk(64, 64); eng.renderFrame(c.getContext('2d'), doc, f, {}); return c.getContext('2d').getImageData(0, 0, 64, 64).data; };
    const a = render(0), b = render(10);
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1) return false;
    return true;
  });
  expect(same).toBe(true);
});

test('번짐: final 렌더는 결정론(미리보기=내보내기 같은 samples)', async ({ page }) => {
  const same = await page.evaluate(async (setupSrc) => {
    const setup = (new Function('return ' + setupSrc))();
    const eq = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const a = await setup({ blurOn: true, layerBlur: true, moving: true, quality: 'final' });
    const b = await setup({ blurOn: true, layerBlur: true, moving: true, quality: 'final' });
    return eq(a.data, b.data);
  }, _renderSetup().toString());
  expect(same).toBe(true);
});
