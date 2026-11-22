// R33-2 — 묶음(batch)·한 명령이 중간에 실패하면 doc 를 호출 전과 같게 되감는다(반만 바뀌지 않게).
//   src/core/ 는 DOM 을 안 쓰므로 브라우저 컨텍스트에서 모듈만 불러와 바로 돌린다.
import { test, expect } from './helpers/fixtures.js';

async function run(page, fn) {
  return page.evaluate(async (src) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { HANDLERS, applyCommand } = await import('/src/core/doc/commands.js');
    const { _pa } = await import('/src/core/doc/patch.js');
    const microtask = () => new Promise((r) => queueMicrotask(r));
    const snap = (v) => JSON.stringify(v);
    // 레이어 a, b 추가 + b.transform.x 에 키(f:0). b 는 키가 있어 정적 setProp 이 throw 된다.
    const mk = () => {
      const store = createStore(createDoc());
      const a = createLayer('image'); store.apply({ type: 'addLayer', layer: a });
      const b = createLayer('image'); store.apply({ type: 'addLayer', layer: b });
      store.apply({ type: 'setProp', id: b.id, path: 'transform.x', value: 7, f: 0 });
      return { store, a, b };
    };
    const f = new Function('createDoc', 'createLayer', 'createStore', 'HANDLERS', 'applyCommand', '_pa', 'microtask', 'snap', 'mk',
      `return (${src})(createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk);`);
    return f(createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk);
  }, fn.toString());
}

test.describe('R33-2 묶음 명령 되감기', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('[batch 되감기] 중간 실패 → doc 원복, 기록·알림 없음', async ({ page }) => {
    const r = await run(page, (createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk) => {
      const { store, a, b } = mk();
      const before = snap(store.get());
      const depth0 = store.undoDepth();
      let notif = 0;
      const unsub = store.subscribe({ any: true }, () => { notif++; });
      let threw = false;
      try {
        store.apply({ type: 'batch', cmds: [
          { type: 'setProp', id: a.id, path: 'transform.x', value: 999 },
          { type: 'setProp', id: b.id, path: 'transform.x', value: 5 },
        ] });
      } catch { threw = true; }
      return microtask().then(() => {
        unsub();
        return { threw, same: snap(store.get()) === before, ax: store.get().layers[a.id].transform.x.value, depth0, depth1: store.undoDepth(), notif };
      });
    });
    expect(r.threw).toBe(true);
    expect(r.ax).toBe(0);            // 되감겨 원래 값(999 아님)
    expect(r.same).toBe(true);       // doc 가 호출 전과 JSON.stringify 기준 동일
    expect(r.depth1).toBe(r.depth0); // 되돌리기 기록 변화 없음
    expect(r.notif).toBe(0);         // 구독자 알림 0건
  });

  test('[undo 안전] 실패한 batch 뒤 undo 는 앞서 의도한 기록(b 키 추가)을 되돌린다', async ({ page }) => {
    const r = await run(page, (createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk) => {
      const store = createStore(createDoc());
      const a = createLayer('image'); store.apply({ type: 'addLayer', layer: a });
      const b = createLayer('image'); store.apply({ type: 'addLayer', layer: b });
      const beforeKey = snap(store.get());   // b 키 추가 전
      store.apply({ type: 'setProp', id: b.id, path: 'transform.x', value: 7, f: 0 });
      try {
        store.apply({ type: 'batch', cmds: [
          { type: 'setProp', id: a.id, path: 'transform.x', value: 999 },
          { type: 'setProp', id: b.id, path: 'transform.x', value: 5 },
        ] });
      } catch {}
      store.undo();   // b 키 추가만 되돌아가야 한다
      // 키 추가를 되감으면 초기 prop({value})으로 돌아가 keys 자체가 사라진다(없으면 0으로 센다).
      return { backToBeforeKey: snap(store.get()) === beforeKey, bKeys: store.get().layers[b.id].transform.x.keys?.length ?? 0 };
    });
    expect(r.backToBeforeKey).toBe(true);
    expect(r.bKeys).toBe(0);
  });

  test('[중첩 batch] 맨 안쪽 마지막 명령이 실패해도 doc 전체가 원복된다', async ({ page }) => {
    const r = await run(page, (createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk) => {
      const { store, a, b } = mk();
      const before = snap(store.get());
      let threw = false;
      try {
        store.apply({ type: 'batch', cmds: [
          { type: 'setProp', id: a.id, path: 'transform.x', value: 111 },
          { type: 'batch', cmds: [
            { type: 'setProp', id: a.id, path: 'transform.y', value: 222 },
            { type: 'setProp', id: b.id, path: 'transform.x', value: 5 },   // throw
          ] },
        ] });
      } catch { threw = true; }
      const t = store.get().layers[a.id].transform;
      return { threw, same: snap(store.get()) === before, ax: t.x.value, ay: t.y.value };
    });
    expect(r.threw).toBe(true);
    expect(r.same).toBe(true);
    expect(r.ax).toBe(0);
    expect(r.ay).toBe(0);
  });

  test('[한 명령 안] 패치를 여럿 쌓은 뒤 던지는 명령도 doc 가 원래대로', async ({ page }) => {
    const r = await run(page, (createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk) => {
      const { store, a } = mk();
      // 가짜 핸들러: 이미 있는 잎 경로 둘을 바꾼 뒤 던진다(실제 크래시와 같은 모양 — 있는 prop 을 건드리다 터짐).
      HANDLERS.__r33Throw = (doc, cmd, patches) => {
        _pa(doc, patches, ['layers', cmd.id, 'transform', 'x', 'value'], 321);
        _pa(doc, patches, ['layers', cmd.id, 'transform', 'y', 'value'], 654);
        throw new Error('boom');
      };
      const before = snap(store.get());
      let threw = false;
      try { store.apply({ type: '__r33Throw', id: a.id }); } catch { threw = true; }
      delete HANDLERS.__r33Throw;
      const t = store.get().layers[a.id].transform;
      return { threw, same: snap(store.get()) === before, ax: t.x.value, ay: t.y.value };
    });
    expect(r.threw).toBe(true);
    expect(r.same).toBe(true);    // 되감기 뒤 doc 가 원래와 완전히 동일(빈 {} 잔재 없음)
    expect(r.ax).toBe(0);
    expect(r.ay).toBe(0);
  });

  test('[preview] 성공 preview 만 기록 1건으로 남고, 실패 preview 는 드래그를 깨지 않는다', async ({ page }) => {
    const r = await run(page, (createDoc, createLayer, createStore, HANDLERS, applyCommand, _pa, microtask, snap, mk) => {
      const { store, a, b } = mk();
      const depth0 = store.undoDepth();
      const bKeysBefore = snap(store.get().layers[b.id].transform.x.keys);
      store.begin('drag');
      store.preview({ type: 'setProp', id: a.id, path: 'transform.x', value: 50 });  // 성공
      const axMid = store.get().layers[a.id].transform.x.value;
      let threw = false;
      try { store.preview({ type: 'setProp', id: b.id, path: 'transform.x', value: 5 }); } catch { threw = true; }  // 실패
      const axAfterFail = store.get().layers[a.id].transform.x.value;   // 드래그 유지
      const bKeysAfterFail = snap(store.get().layers[b.id].transform.x.keys);
      store.commit();
      const depth1 = store.undoDepth();
      const axCommitted = store.get().layers[a.id].transform.x.value;
      store.undo();
      const axUndone = store.get().layers[a.id].transform.x.value;
      return { threw, axMid, axAfterFail, bKept: bKeysAfterFail === bKeysBefore, depthDelta: depth1 - depth0, axCommitted, axUndone };
    });
    expect(r.threw).toBe(true);
    expect(r.axMid).toBe(50);
    expect(r.axAfterFail).toBe(50);   // 실패 preview 가 진행 중 드래그를 깨지 않는다
    expect(r.bKept).toBe(true);       // 실패 preview 의 변경은 새어 나오지 않는다
    expect(r.depthDelta).toBe(1);     // 성공 preview 만 기록 1건
    expect(r.axCommitted).toBe(50);
    expect(r.axUndone).toBe(0);       // 그 기록을 undo 하면 원래대로
  });
});
