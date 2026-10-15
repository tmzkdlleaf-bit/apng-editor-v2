// R2 추가 — 편집 조작 버그 수정 검증(단위 + DOM 드래그).
import { test, expect } from '@playwright/test';

async function blank(page) { await page.goto('/tests/e1-helpers.js'); }

test.describe('R2 추가 — 편집 조작', () => {
  // R2-1: moveKeys 겹침 → 옮긴 키가 이김
  test('moveKeys: 비선택 키와 같은 프레임에 겹치면 옮긴 키가 이긴다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      const s = createLayer('shape', { name: 's' });
      s.transform.x = { value: 0, keys: [{ f: 0, v: 10, ease: 'linear' }, { f: 5, v: 99, ease: 'linear' }] };
      doc.layers[s.id] = s; doc.order.push(s.id);
      const st = createStore(doc);
      // f=0 키를 +5 이동 → f=5 의 비선택 키와 겹침. 옮긴 키(v=10)가 이겨야 한다.
      st.apply({ type: 'moveKeys', id: s.id, refs: [{ path: 'transform.x', f: 0 }], delta: 5 });
      const keys = st.get().layers[s.id].transform.x.keys;
      return { n: keys.length, f: keys[0].f, v: keys[0].v };
    });
    expect(r.n).toBe(1);
    expect(r.f).toBe(5);
    expect(r.v).toBe(10); // 옮긴 키가 이김
  });

  // R2-3 보강: setKey 가 cubicBezier 제어점을 보존한다
  test('setKey: cubicBezier 면 bezier 제어점을 보존한다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      const s = createLayer('shape', { name: 's' });
      doc.layers[s.id] = s; doc.order.push(s.id);
      const st = createStore(doc);
      st.apply({ type: 'setKey', id: s.id, path: 'transform.x', f: 3, v: 20, ease: 'cubicBezier', bezier: [0.3, 0, 0.7, 1] });
      return st.get().layers[s.id].transform.x.keys[0];
    });
    expect(r).toEqual({ f: 3, v: 20, ease: 'cubicBezier', bezier: [0.3, 0, 0.7, 1] });
  });

  // R2-4 보강: resizeCanvas recenter 가 카메라 X/Y 키도 같이 옮긴다
  test('resizeCanvas recenter: 카메라 X/Y 값·키도 같이 옮겨진다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { evalProp } = await import('/src/core/anim/prop.js');
      const doc = createDoc({ width: 100, height: 100 });
      doc.camera.x = { value: 10, keys: [{ f: 0, v: 10, ease: 'linear' }, { f: 5, v: 20, ease: 'linear' }] };
      doc.camera.y.value = 0;
      const st = createStore(doc);
      st.apply({ type: 'resizeCanvas', width: 200, height: 200, recenter: true }); // dx=dy=50
      const cx = st.get().camera.x;
      return { f0: evalProp(cx, 0), f5: evalProp(cx, 5), y: st.get().camera.y.value };
    });
    expect(r.f0).toBe(60);
    expect(r.f5).toBe(70);
    expect(r.y).toBe(50);
  });

  // R2-5 보강: 복제 범위 안을 가리키는 인스턴스 masterId·효과 소스가 복제본끼리 연결
  test('duplicateLayers: 인스턴스 masterId·효과 소스가 복제본끼리 연결된다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      // 그룹 g( 자식 shapeA ) + 같은 그룹 안 효과 fx(소스 → shapeA)
      const a = createLayer('shape', { name: 'a' });
      const fx = createLayer('effect', { name: 'fx', effectId: 'test-source-mirror' });
      fx.sources = [{ key: 'src', sourceId: a.id }];
      const g = createLayer('group', { name: 'g', childOrder: [a.id, fx.id] });
      a.parentId = g.id; fx.parentId = g.id;
      // 인스턴스(마스터 = g)
      const inst = createLayer('instance', { name: 'inst', masterId: g.id });
      doc.layers[a.id] = a; doc.layers[fx.id] = fx; doc.layers[g.id] = g; doc.layers[inst.id] = inst;
      doc.order.push(g.id, inst.id);
      const st = createStore(doc);
      // g 와 inst 를 함께 복제 (g 의 자식도 함께)
      st.apply({ type: 'duplicateLayers', ids: [g.id, inst.id] });
      const d = st.get();
      // 새 레이어들 찾기
      const dupG   = Object.values(d.layers).find(l => l.name === 'g 복사');
      const dupInst = Object.values(d.layers).find(l => l.name === 'inst 복사');
      const dupA   = dupG ? d.layers[dupG.childOrder[0]] : null;
      const dupFx  = dupG ? d.layers[dupG.childOrder[1]] : null;
      return {
        instPointsToDupG: dupInst?.masterId === dupG?.id,
        instNotOrig: dupInst?.masterId !== g.id,
        fxPointsToDupA: dupFx?.sources?.[0]?.sourceId === dupA?.id,
        fxNotOrig: dupFx?.sources?.[0]?.sourceId !== a.id,
      };
    });
    expect(r.instPointsToDupG).toBe(true);
    expect(r.instNotOrig).toBe(true);
    expect(r.fxPointsToDupA).toBe(true);
    expect(r.fxNotOrig).toBe(true);
  });

  // R2-2 보강: 드래그(batch) 중엔 undo/redo 가 null 을 돌려주고 apply 는 막힌다
  test('store: begin 중 undo/redo 는 null, isBatching 참', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      const s = createLayer('shape', { name: 's' }); s.transform.x.value = 0;
      doc.layers[s.id] = s; doc.order.push(s.id);
      const st = createStore(doc);
      st.apply({ type: 'setProp', id: s.id, path: 'transform.x', value: 10 });
      st.begin('drag');
      st.preview({ type: 'setProp', id: s.id, path: 'transform.x', value: 50 });
      const u = st.undo(); const rd = st.redo(); const batching = st.isBatching();
      st.commit();
      return { u, rd, batching, after: st.get().layers[s.id].transform.x.value };
    });
    expect(r.u).toBeNull();
    expect(r.rd).toBeNull();
    expect(r.batching).toBe(true);
    expect(r.after).toBe(50);
  });

  // R2-1 DOM: 한 드래그 안에서 오른쪽 4칸 → 왼쪽 1칸 = 순이동 3, 되돌리기 1번에 원상복구
  test('[R2-1 DOM] 방향 바꿔 끌어도 원래 선택 기준으로 순이동, 되돌리기 1번', async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
    const id = await page.evaluate(() => { const d = window.__store.get(); for (const i of d.order) if (d.layers[i].name === '사각형') return i; });
    await page.evaluate((id) => {
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 2 });
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 200, f: 12 });
      window.__editorState.set({ tlSnap: false });
    }, id);
    await page.waitForTimeout(150);
    const depth0 = await page.evaluate(() => window.__store.undoDepth());
    const box = await page.locator('.track-body-canvas').boundingBox();
    const info = await page.evaluate((id) => {
      const doc = window.__store.get(); const rows = [...doc.order].reverse();
      const cw = document.querySelector('.track-body-canvas').getBoundingClientRect().width;
      return { idx: rows.indexOf(id), cell: cw / doc.meta.frameCount };
    }, id);
    const y = box.y + info.idx * 28 + 14;
    const x0 = box.x + 2 * info.cell + info.cell / 2;
    await page.mouse.move(x0, y); await page.mouse.down();
    for (let k = 1; k <= 4; k++) { await page.mouse.move(x0 + k * info.cell, y); await page.waitForTimeout(20); }
    await page.mouse.move(x0 + 3 * info.cell, y); await page.waitForTimeout(20); // 왼쪽 1칸
    await page.mouse.up();
    const r = await page.evaluate((id) => ({
      keys: window.__store.get().layers[id].transform.x.keys.map((k) => k.f),
      sel: window.__editorState.get().kfSelection.map((s) => s.f),
      addedDepth: window.__store.undoDepth(),
    }), id);
    expect(r.keys).toEqual([5, 12]);  // 2 + 3
    expect(r.sel).toEqual([5]);
    // 되돌리기 1번에 원래(f=2)로
    const undone = await page.evaluate((args) => {
      window.__store.undo();
      return window.__store.get().layers[args.id].transform.x.keys.map((k) => k.f);
    }, { id });
    expect(undone).toEqual([2, 12]);
    expect(r.addedDepth - depth0).toBe(1); // 드래그는 기록 1건
  });
});
