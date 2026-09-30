import { test, expect } from '@playwright/test';

// 각 page.evaluate 안에서 재사용할 무결성 검사 함수(문자열로 전달)
const INTEGRITY = `
function checkIntegrity(doc) {
  const allIds = new Set(Object.keys(doc.layers));
  const seen = new Set();
  function visit(order, parentId) {
    for (const id of order) {
      if (!allIds.has(id)) throw new Error('order에 존재하지 않는 레이어: ' + id);
      if (seen.has(id)) throw new Error('레이어 ' + id + ' 중복');
      seen.add(id);
      const layer = doc.layers[id];
      const actual = layer.parentId ?? null;
      if (actual !== (parentId ?? null))
        throw new Error('parentId 불일치: ' + id + ' actual=' + actual + ' expected=' + parentId);
      if (layer.childOrder) visit(layer.childOrder, id);
    }
  }
  visit(doc.order, null);
  if (seen.size !== allIds.size) {
    const missing = [...allIds].filter(id => !seen.has(id));
    throw new Error('order에 없는 레이어: ' + missing);
  }
  return true;
}
`;

test.describe('P2 보완', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ─── 1. setProp 오류 조건 ──────────────────────────────────────────────────

  test('setProp: 키프레임 있을 때 f 없으면 오류', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      // 키프레임 추가
      store.apply({ type: 'setKey', id: layer.id, path: 'transform.x', f: 0, v: 0, ease: 'linear' });
      // f 없이 setProp → 반드시 오류
      let msg = '';
      try {
        store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 100 });
      } catch (e) { msg = e.message; }
      checkIntegrity(store.get());
      return msg.includes('키프레임') ? 'ok' : '오류 안 던짐: ' + msg;
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('setProp: f 있으면 keys만 수정, value 변경 없음', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      // 먼저 정적 값 50 설정
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 50 });
      // f 있는 setProp → value는 그대로 50
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 100, f: 5 });
      const prop = store.get().layers[layer.id].transform.x;
      checkIntegrity(store.get());
      if (prop.value !== 50) return 'value가 바뀜: ' + prop.value;
      if (!prop.keys?.some(k => k.f === 5 && k.v === 100)) return 'key 없음: ' + JSON.stringify(prop.keys);
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  // ─── 1c. offsetProp ──────────────────────────────────────────────────────

  test('offsetProp: 키 없으면 value에 더함', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 10 });
      store.apply({ type: 'offsetProp', id: layer.id, path: 'transform.x', delta: 5 });
      const prop = store.get().layers[layer.id].transform.x;
      checkIntegrity(store.get());
      return prop.value === 15 ? 'ok' : 'value=' + prop.value;
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('offsetProp: 키 있으면 모든 키의 v에 더함', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'setKey', id: layer.id, path: 'transform.x', f: 0, v: 10, ease: 'linear' });
      store.apply({ type: 'setKey', id: layer.id, path: 'transform.x', f: 12, v: 20, ease: 'linear' });
      store.apply({ type: 'offsetProp', id: layer.id, path: 'transform.x', delta: 3 });
      const keys = store.get().layers[layer.id].transform.x.keys;
      checkIntegrity(store.get());
      if (keys[0].v !== 13) return 'key[0].v=' + keys[0].v;
      if (keys[1].v !== 23) return 'key[1].v=' + keys[1].v;
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('offsetProp: undo/redo', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 10 });
      store.apply({ type: 'offsetProp', id: layer.id, path: 'transform.x', delta: 5 });
      store.undo();
      const afterUndo = store.get().layers[layer.id].transform.x.value;
      store.redo();
      const afterRedo = store.get().layers[layer.id].transform.x.value;
      checkIntegrity(store.get());
      if (afterUndo !== 10) return 'undo 후 value=' + afterUndo;
      if (afterRedo !== 15) return 'redo 후 value=' + afterRedo;
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  // ─── 2. 키프레임 필드 이름: ease ──────────────────────────────────────────

  test('키프레임 필드: ease 사용, e 필드 없음', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'setKey', id: layer.id, path: 'transform.x', f: 0, v: 10, ease: 'easeIn' });
      const key = store.get().layers[layer.id].transform.x.keys?.[0];
      checkIntegrity(store.get());
      if (!key) return 'key 없음';
      if ('e' in key) return 'e 필드가 남아있음';
      if (key.ease !== 'easeIn') return 'ease=' + key.ease;
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('setProp f 있을 때 저장된 키에 ease 필드', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 0, f: 0, ease: 'easeOut' });
      const key = store.get().layers[layer.id].transform.x.keys?.[0];
      checkIntegrity(store.get());
      if (!key) return 'key 없음';
      if ('e' in key) return 'e 필드가 남아있음';
      if (key.ease !== 'easeOut') return 'ease=' + key.ease;
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  // ─── 3. duplicateLayers 그룹 재귀 ─────────────────────────────────────────

  test('duplicateLayers: 그룹 자손 전체 복제 및 id 갱신', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const child = createLayer('image');
      const group = createLayer('group');
      store.apply({ type: 'addLayer', layer: group });
      store.apply({ type: 'addLayer', layer: child, parentId: group.id });
      store.apply({ type: 'duplicateLayers', ids: [group.id] });
      const doc = store.get();
      checkIntegrity(doc);
      const allIds = Object.keys(doc.layers);
      if (allIds.length !== 4) return '레이어 수=' + allIds.length + ' 기대=4';
      // 복제된 그룹 찾기
      const origGroup = doc.layers[group.id];
      const dupGroupId = doc.order.find(id => id !== group.id);
      if (!dupGroupId) return '복제 그룹 없음';
      const dupGroup = doc.layers[dupGroupId];
      if (dupGroup.childOrder.length !== 1) return '복제 그룹 자손 수=' + dupGroup.childOrder.length;
      const dupChildId = dupGroup.childOrder[0];
      if (dupChildId === child.id) return '복제 자식 id가 원본과 같음';
      const dupChild = doc.layers[dupChildId];
      if (dupChild.parentId !== dupGroupId) return '복제 자식 parentId 불일치';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('duplicateLayers: clips prefix clp_', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      layer.clips = [{ id: 'clp_original', start: 0, end: 10 }];
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'duplicateLayers', ids: [layer.id] });
      const doc = store.get();
      checkIntegrity(doc);
      const dupId = doc.order.find(id => id !== layer.id);
      const dup = doc.layers[dupId];
      if (!dup.clips?.length) return 'clips 없음';
      const clipId = dup.clips[0].id;
      if (!clipId.startsWith('clp_')) return 'clip id prefix: ' + clipId;
      if (clipId === 'clp_original') return 'clip id가 원본과 같음';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('duplicateLayers: mask.sourceId를 새 id로 교체', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const src = createLayer('image');
      const masked = createLayer('image');
      masked.mask = { sourceId: src.id, mode: 'alpha' };
      store.apply({ type: 'addLayer', layer: src });
      store.apply({ type: 'addLayer', layer: masked });
      // 두 레이어를 함께 복제
      store.apply({ type: 'duplicateLayers', ids: [src.id, masked.id] });
      const doc = store.get();
      checkIntegrity(doc);
      // 복제된 masked 찾기: src.id 자리 다음 순서에 있는 새 레이어들
      const allIds = Object.keys(doc.layers);
      const newIds = allIds.filter(id => id !== src.id && id !== masked.id);
      if (newIds.length !== 2) return '새 레이어 수=' + newIds.length;
      // newIds 중 mask가 있는 것
      const dupMasked = newIds.map(id => doc.layers[id]).find(l => l.mask);
      if (!dupMasked) return '복제된 masked 레이어 없음';
      // sourceId가 원본 src를 가리키면 안 됨
      if (dupMasked.mask.sourceId === src.id) return 'mask.sourceId가 원본을 가리킴';
      // sourceId가 새 src를 가리켜야 함
      const dupSrc = newIds.map(id => doc.layers[id]).find(l => !l.mask);
      if (dupMasked.mask.sourceId !== dupSrc.id) return 'mask.sourceId가 새 src를 가리키지 않음';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  // ─── 4. moveLayer 자손 이동 방지 ──────────────────────────────────────────

  test('moveLayer: 자기 자손으로 이동하면 빈 patch 반환', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const child = createLayer('image');
      const group = createLayer('group');
      store.apply({ type: 'addLayer', layer: group });
      store.apply({ type: 'addLayer', layer: child, parentId: group.id });
      const docBefore = JSON.stringify(store.get());
      const patches = store.apply({ type: 'moveLayer', id: group.id, parentId: child.id });
      const docAfter = JSON.stringify(store.get());
      checkIntegrity(store.get());
      if (patches.length !== 0) return 'patches.length=' + patches.length;
      if (docBefore !== docAfter) return '문서가 변경됨';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('moveLayer: 자기 자신으로 이동하면 빈 patch 반환', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('group');
      store.apply({ type: 'addLayer', layer });
      const patches = store.apply({ type: 'moveLayer', id: layer.id, parentId: layer.id });
      checkIntegrity(store.get());
      return patches.length === 0 ? 'ok' : 'patches.length=' + patches.length;
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  // ─── 5. group 자손 제외 및 다중 부모 ──────────────────────────────────────

  test('group: ids 중 다른 id의 자손은 제외', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const child = createLayer('image');
      const parent = createLayer('group');
      store.apply({ type: 'addLayer', layer: parent });
      store.apply({ type: 'addLayer', layer: child, parentId: parent.id });
      // [parent, child] → child는 parent의 자손 → 제외 → parent만 그룹화
      store.apply({ type: 'group', ids: [parent.id, child.id] });
      const doc = store.get();
      checkIntegrity(doc);
      // child가 여전히 parent의 자손이어야 함(새 그룹 안에 parent, parent 안에 child)
      const newGroupId = doc.order[0];
      const newGroup = doc.layers[newGroupId];
      if (!newGroup) return '새 그룹 없음';
      if (!newGroup.childOrder.includes(parent.id)) return 'parent가 새 그룹 안에 없음';
      if (newGroup.childOrder.includes(child.id)) return 'child가 직접 새 그룹 안에 있음(제외 안 됨)';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('group: 부모가 달라도 그룹 가능', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const g1 = createLayer('group');
      const g2 = createLayer('group');
      const a = createLayer('image');
      const b = createLayer('image');
      store.apply({ type: 'addLayer', layer: g1 });
      store.apply({ type: 'addLayer', layer: g2 });
      store.apply({ type: 'addLayer', layer: a, parentId: g1.id });
      store.apply({ type: 'addLayer', layer: b, parentId: g2.id });
      store.apply({ type: 'group', ids: [a.id, b.id] });
      const doc = store.get();
      checkIntegrity(doc);
      // 새 그룹 찾기: a와 b 모두 같은 그룹의 자식
      const newGroupId = doc.layers[a.id].parentId;
      if (newGroupId === g1.id || newGroupId === g2.id) return 'a가 원래 부모에 있음';
      if (doc.layers[b.id].parentId !== newGroupId) return 'b 부모가 새 그룹이 아님';
      const newGroup = doc.layers[newGroupId];
      if (!newGroup.childOrder.includes(a.id)) return 'a가 새 그룹 안에 없음';
      if (!newGroup.childOrder.includes(b.id)) return 'b가 새 그룹 안에 없음';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  test('group: createLayer(group) 사용 — transform 등 공통 필드 존재', async ({ page }) => {
    const result = await page.evaluate(async (integ) => {
      eval(integ);
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const a = createLayer('image');
      store.apply({ type: 'addLayer', layer: a });
      store.apply({ type: 'group', ids: [a.id] });
      const doc = store.get();
      checkIntegrity(doc);
      const gId = doc.order[0];
      const g = doc.layers[gId];
      if (!g.transform?.x) return 'transform.x 없음';
      if (!('anchor' in g)) return 'anchor 없음';
      if (!('clips' in g)) return 'clips 없음';
      return 'ok';
    }, INTEGRITY);
    expect(result).toBe('ok');
  });

  // ─── 6. store 보완 ────────────────────────────────────────────────────────

  test('store: begin 중 begin 호출 → 오류', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      store.begin('첫번째');
      let msg = '';
      try { store.begin('두번째'); } catch (e) { msg = e.message; }
      store.cancel();
      return msg ? 'ok: ' + msg : '오류 안 던짐';
    });
    expect(result).toMatch(/^ok:/);
  });

  test('store: begin 중 apply 호출 → 오류', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.begin('드래그');
      let msg = '';
      try {
        store.apply({ type: 'setMeta', patch: { fps: 24 } });
      } catch (e) { msg = e.message; }
      store.cancel();
      return msg ? 'ok: ' + msg : '오류 안 던짐';
    });
    expect(result).toMatch(/^ok:/);
  });

  test('store: begin selectionSnapshot → undo 반환값에 포함', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const snap = { selected: [layer.id] };
      store.begin('드래그', { selectionSnapshot: snap });
      store.preview({ type: 'setMeta', patch: { fps: 24 } });
      store.commit();
      const ret = store.undo();
      if (!ret) return 'undo가 null 반환';
      if (!ret.selectionSnapshot) return 'selectionSnapshot 없음';
      if (ret.selectionSnapshot.selected[0] !== layer.id) return 'selectionSnapshot 내용 불일치';
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  test('store: apply selectionSnapshot → undo 반환값에 포함', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const snap = { selected: ['abc'] };
      store.apply({ type: 'setMeta', patch: { fps: 24 } }, { selectionSnapshot: snap });
      const ret = store.undo();
      if (!ret) return 'undo null';
      if (ret.selectionSnapshot?.selected[0] !== 'abc') return JSON.stringify(ret);
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  test('store: redo도 selectionSnapshot 반환', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const snap = { selected: ['xyz'] };
      store.apply({ type: 'setMeta', patch: { fps: 24 } }, { selectionSnapshot: snap });
      store.undo();
      const ret = store.redo();
      if (!ret) return 'redo null';
      if (ret.selectionSnapshot?.selected[0] !== 'xyz') return JSON.stringify(ret);
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  test('store: undo 할 것 없으면 null', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const ret = store.undo();
      return ret === null ? 'ok' : 'undo 반환: ' + JSON.stringify(ret);
    });
    expect(result).toBe('ok');
  });

  test('store: redo 할 것 없으면 null', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const ret = store.redo();
      return ret === null ? 'ok' : 'redo 반환: ' + JSON.stringify(ret);
    });
    expect(result).toBe('ok');
  });

  test('store: redo 기록 있으면 merge 안 함', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      // 두 번 apply(merge) → merge됨
      store.apply({ type: 'setMeta', patch: { fps: 10 } }, { merge: true });
      store.apply({ type: 'setMeta', patch: { fps: 20 } }, { merge: true });
      store.undo(); // redo 기록 생김
      // 이제 apply(merge) → redo 기록 있음 → merge 안 됨
      store.apply({ type: 'setMeta', patch: { fps: 30 } }, { merge: true });
      if (store.canRedo()) return 'redo가 남아있음 — 비워지지 않음';
      store.undo(); // fps→12(초기값)
      if (store.canUndo()) return 'undo가 아직 있음 — merge됐음';
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  test('store: cancel 알림 source는 cancel', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      let source = null;
      store.subscribe({ any: true }, (n) => { source = n.source; });
      store.begin('테스트');
      store.preview({ type: 'setMeta', patch: { fps: 24 } });
      store.cancel();
      await new Promise(r => queueMicrotask(r));
      return source === 'cancel' ? 'ok' : 'source=' + source;
    });
    expect(result).toBe('ok');
  });

  test('알림 keys: 레이어 path[2] 포함', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      let notifKeys = null;
      store.subscribe({ any: true }, (n) => { notifKeys = n.keys; });
      store.apply({ type: 'setLayer', id: layer.id, patch: { name: '변경' } });
      await new Promise(r => queueMicrotask(r));
      if (!notifKeys) return 'notifKeys null';
      return notifKeys.has('name') ? 'ok' : 'keys=' + [...notifKeys];
    });
    expect(result).toBe('ok');
  });

  test('알림 keys: transform 경로 → transform 포함', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      let notifKeys = null;
      store.subscribe({ any: true }, (n) => { notifKeys = n.keys; });
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 100 });
      await new Promise(r => queueMicrotask(r));
      if (!notifKeys) return 'notifKeys null';
      return notifKeys.has('transform') ? 'ok' : 'keys=' + [...notifKeys];
    });
    expect(result).toBe('ok');
  });

  test('알림 order: childOrder 변경 시 order=true', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const store = createStore(createDoc());
      const g = createLayer('group');
      store.apply({ type: 'addLayer', layer: g });
      let notifOrder = false;
      store.subscribe({ any: true }, (n) => { notifOrder = n.order; });
      // 그룹에 자식 추가 → childOrder 변경
      const child = createLayer('image');
      store.apply({ type: 'addLayer', layer: child, parentId: g.id });
      await new Promise(r => queueMicrotask(r));
      return notifOrder ? 'ok' : 'order=' + notifOrder;
    });
    expect(result).toBe('ok');
  });
});
