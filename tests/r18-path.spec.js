// R18 — 곡선 이동 경로(sp)·경로 따라 회전(autoOrient).
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

function _xkeys(arr) { return { value: arr[0].v, keys: arr }; }

test('evalPosition: sp 없으면 x·y 를 evalProp 과 비트 단위로 같게', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalPosition } = await import('/src/core/anim/position.js');
    const { evalProp } = await import('/src/core/anim/prop.js');
    const tr = {
      x: { value: 0, keys: [{ f: 0, v: 0, ease: 'easeInOut' }, { f: 10, v: 100, ease: 'linear' }] },
      y: { value: 0, keys: [{ f: 0, v: 20, ease: 'easeInOut' }, { f: 10, v: 80, ease: 'linear' }] },
    };
    for (const f of [0, 2, 5, 7, 10]) {
      const p = evalPosition(tr, f);
      if (p.x !== evalProp(tr.x, f) || p.y !== evalProp(tr.y, f)) return `f=${f} 불일치`;
    }
    return 'ok';
  });
  expect(ok).toBe('ok');
});

test('evalPosition: x·y 프레임이 다르면 sp 있어도 직선 fallback', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalPosition } = await import('/src/core/anim/position.js');
    const { evalProp } = await import('/src/core/anim/prop.js');
    const tr = {
      x: { keys: [{ f: 0, v: 0, ease: 'linear', sp: { ox: 50, oy: -50 } }, { f: 10, v: 100, ease: 'linear' }] },
      y: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 5, v: 50, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] },
    };
    const p = evalPosition(tr, 5);
    return (Math.abs(p.x - evalProp(tr.x, 5)) < 1e-9 && Math.abs(p.y - evalProp(tr.y, 5)) < 1e-9) ? 'ok' : `x=${p.x} y=${p.y}`;
  });
  expect(ok).toBe('ok');
});

test('가운데 키 손잡이 → 가운데 구간이 직선에서 벗어난다', async ({ page }) => {
  const y5 = await page.evaluate(async () => {
    const { evalPosition } = await import('/src/core/anim/position.js');
    // 세 키가 y=0 직선 위. 가운데 키(f10)에 위로 당기는 손잡이.
    const tr = {
      x: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 50, ease: 'linear', sp: { ix: -10, iy: -20, ox: 10, oy: -20 } }, { f: 20, v: 100, ease: 'linear' }] },
      y: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 0, ease: 'linear' }, { f: 20, v: 0, ease: 'linear' }] },
    };
    return evalPosition(tr, 5).y;
  });
  expect(y5).toBeLessThan(-1); // 직선(y=0)에서 위로 벗어남
});

test('곡선 길이 비율: linear 이징이면 프레임 사이 이동 거리가 고르다', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { evalPosition } = await import('/src/core/anim/position.js');
    const tr = {
      x: { keys: [{ f: 0, v: 0, ease: 'linear', sp: { ox: 60, oy: 0 } }, { f: 20, v: 100, ease: 'linear', sp: { ix: 0, iy: -60 } }] },
      y: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 20, v: 100, ease: 'linear' }] },
    };
    const pts = []; for (let f = 0; f <= 20; f++) pts.push(evalPosition(tr, f));
    const steps = []; for (let i = 1; i < pts.length; i++) steps.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
    return { mean, sd, ratio: Math.max(...steps) / Math.min(...steps), cov: sd / mean };
  });
  // 길이 비율 매핑이 없다면 베지어 파라미터 등속이라 편차가 큼. 고르게(변동계수 작게).
  expect(r.cov).toBeLessThan(0.2);
  expect(r.ratio).toBeLessThan(1.8);
});

test('autoOrient: 오른쪽 이동 ≈ 0도, 아래 이동 ≈ 90도', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { evalPosition } = await import('/src/core/anim/position.js');
    const right = { x: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] }, y: { keys: [{ f: 0, v: 50, ease: 'linear' }, { f: 10, v: 50, ease: 'linear' }] } };
    const down = { x: { keys: [{ f: 0, v: 50, ease: 'linear' }, { f: 10, v: 50, ease: 'linear' }] }, y: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] } };
    return { r: evalPosition(right, 5).angle, d: evalPosition(down, 5).angle };
  });
  expect(Math.abs(r.r)).toBeLessThan(2);
  expect(Math.abs(r.d - 90)).toBeLessThan(2);
});

test('evalTransform: autoOrient 면 회전에 진행 방향을 더한다', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { evalTransform } = await import('/src/core/anim/evaluate.js');
    const doc = createDoc();
    const l = createLayer('shape');
    l.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] };
    l.transform.y = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] }; // 대각선 ↘ ≈ 45도
    doc.layers[l.id] = l; doc.order.push(l.id);
    const store = createStore(doc);
    const off = evalTransform(store.get(), l.id, 5, new Map()).rotation;
    store.apply({ type: 'setLayer', id: l.id, patch: { autoOrient: true } });
    const on = evalTransform(store.get(), l.id, 5, new Map()).rotation;
    return (Math.abs(off) < 1e-9 && Math.abs(on - 45) < 2) ? 'ok' : `off=${off} on=${on}`;
  });
  expect(ok).toBe('ok');
});

test('setKeyHandle: 되돌리기 1건, undo 로 sp 제거; 저장 왕복에서 sp 유지', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');
    const doc = createDoc();
    const l = createLayer('shape');
    l.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] };
    l.transform.y = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] };
    doc.layers[l.id] = l; doc.order.push(l.id);
    const store = createStore(doc);
    const d0 = store.undoDepth();
    store.apply({ type: 'setKeyHandle', id: l.id, f: 0, sp: { ix: 0, iy: 0, ox: 30, oy: -40 } });
    if (store.undoDepth() !== d0 + 1) return '되돌리기 1건 아님';
    const k0 = store.get().layers[l.id].transform.x.keys.find(k => k.f === 0);
    if (!(k0.sp && k0.sp.ox === 30)) return 'sp 안 들어감';
    const file = JSON.parse(JSON.stringify(await buildProjectFile(store.get())));
    const { doc: back } = await importProjectFile(file);
    const bk = back.layers[l.id].transform.x.keys.find(k => k.f === 0);
    if (!(bk.sp && bk.sp.oy === -40)) return '왕복에서 sp 유실';
    store.undo();
    const after = store.get().layers[l.id].transform.x.keys.find(k => k.f === 0);
    if (after.sp) return 'undo 후 sp 남음';
    return 'ok';
  });
  expect(ok).toBe('ok');
});

test('moveKeys·setKey(복사)에서 sp 보존', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const doc = createDoc();
    const l = createLayer('shape');
    l.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear', sp: { ix: -20, iy: 0, ox: 20, oy: 0 } }] };
    l.transform.y = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 50, ease: 'linear' }] };
    doc.layers[l.id] = l; doc.order.push(l.id);
    const store = createStore(doc);
    store.apply({ type: 'moveKeys', id: l.id, refs: [{ path: 'transform.x', f: 10 }], delta: 2 });
    const moved = store.get().layers[l.id].transform.x.keys.find(k => k.f === 12);
    if (!(moved?.sp && moved.sp.ox === 20)) return 'moveKeys 가 sp 유실';
    // setKey 로 복사 붙여넣기(sp 전달)
    store.apply({ type: 'setKey', id: l.id, path: 'transform.x', f: 5, v: 30, ease: 'linear', sp: { ix: -5, iy: -5, ox: 5, oy: 5 } });
    const pasted = store.get().layers[l.id].transform.x.keys.find(k => k.f === 5);
    return (pasted?.sp && pasted.sp.ox === 5) ? 'ok' : 'setKey sp 유실';
  });
  expect(ok).toBe('ok');
});

test('UI: 경로 버튼(부드럽게·따라 회전)과 X·Y 맞추기 안내', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  const id = await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '경로' });
    l.shape = { kind: 'rect', w: 40, h: 40, fill: '#ff8800', stroke: null };
    l.transform.x = { value: 0, keys: [{ f: 0, v: 60, ease: 'linear' }, { f: 12, v: 300, ease: 'linear' }, { f: 24, v: 540, ease: 'linear' }] };
    l.transform.y = { value: 0, keys: [{ f: 0, v: 400, ease: 'linear' }, { f: 12, v: 150, ease: 'linear' }, { f: 24, v: 400, ease: 'linear' }] };
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id] });
    return l.id;
  });
  await page.waitForTimeout(100);
  await expect(page.getByRole('button', { name: '경로 부드럽게' })).toBeVisible();
  await page.getByRole('button', { name: '경로 부드럽게' }).click();
  await page.waitForTimeout(40);
  const curved = await page.evaluate((i) => {
    const xk = window.__store.get().layers[i].transform.x.keys;
    return xk.some(k => k.sp);
  }, id);
  expect(curved).toBe(true);

  await page.getByRole('button', { name: '경로 따라 회전' }).click();
  await page.waitForTimeout(40);
  expect(await page.evaluate((i) => window.__store.get().layers[i].autoOrient, id)).toBe(true);
});
