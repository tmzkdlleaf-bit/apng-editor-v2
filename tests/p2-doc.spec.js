import { test, expect } from '@playwright/test';

// 모듈을 브라우저 컨텍스트에서 동적 import해 실행한다.
// src/core/는 DOM을 쓰지 않으므로 브라우저와 Worker 어디서나 동작한다.

const microtask = () => new Promise(r => queueMicrotask(r));
const snap = v => JSON.stringify(v);

test.describe('P2 - 문서 모델', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── 헬퍼 ──────────────────────────────────────────────
  async function evalDoc(page, fn) {
    return page.evaluate(async (src) => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const microtask = () => new Promise(r => queueMicrotask(r));
      const snap = v => JSON.stringify(v);
      return (new Function('createDoc', 'createLayer', 'createStore', 'microtask', 'snap', `return (${src})(createDoc, createLayer, createStore, microtask, snap)`))(
        createDoc, createLayer, createStore, microtask, snap
      );
    }, fn.toString());
  }

  // ── 1. 명령별 apply → undo → 원본 동일 → redo → apply 후 동일 ──

  test('addLayer: undo/redo가 문서를 원복한다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const before = s(store.get());

      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const afterApply = s(store.get());

      if (afterApply === before) return 'apply가 변경하지 않음';

      store.undo();
      if (s(store.get()) !== before) return `undo 실패: ${s(store.get())} !== ${before}`;

      store.redo();
      if (s(store.get()) !== afterApply) return 'redo 실패';

      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('removeLayers: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.apply({ type: 'removeLayers', ids: [layer.id] });
      const afterApply = s(store.get());
      if (afterApply === before) return 'apply가 변경하지 않음';

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';

      store.redo();
      if (s(store.get()) !== afterApply) return 'redo 실패';

      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('setLayer: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.apply({ type: 'setLayer', id: layer.id, patch: { name: '이름변경' } });
      const afterApply = s(store.get());

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';
      store.redo();
      if (s(store.get()) !== afterApply) return 'redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('setMeta: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const before = s(store.get());

      store.apply({ type: 'setMeta', patch: { fps: 24 } });
      const afterApply = s(store.get());

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';
      store.redo();
      if (s(store.get()) !== afterApply) return 'redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('resizeCanvas: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const before = s(store.get());
      store.apply({ type: 'resizeCanvas', width: 1024, height: 512 });
      const afterApply = s(store.get());

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';
      store.redo();
      if (s(store.get()) !== afterApply) return 'redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('setProp: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 100 });
      const afterApply = s(store.get());

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';
      store.redo();
      if (s(store.get()) !== afterApply) return 'redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('setKey / removeKey: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.apply({ type: 'setKey', id: layer.id, path: 'transform.x', f: 5, v: 50, ease: 'linear' });
      const afterKey = s(store.get());

      store.apply({ type: 'removeKey', id: layer.id, path: 'transform.x', f: 5 });
      const afterRemove = s(store.get());

      store.undo();
      if (s(store.get()) !== afterKey) return 'removeKey undo 실패';
      store.undo();
      if (s(store.get()) !== before) return 'setKey undo 실패';
      store.redo();
      if (s(store.get()) !== afterKey) return 'setKey redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('addClip / removeClip: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer, newId } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      const clip = { id: newId('clip_'), startF: 0, endF: 10, tracks: [] };
      store.apply({ type: 'addClip', id: layer.id, clip });
      const afterAdd = s(store.get());

      store.apply({ type: 'removeClip', id: layer.id, clipId: clip.id });
      store.undo();
      if (s(store.get()) !== afterAdd) return 'removeClip undo 실패';
      store.undo();
      if (s(store.get()) !== before) return 'addClip undo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('group / ungroup: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layerA = createLayer('image');
      const layerB = createLayer('image');
      store.apply({ type: 'addLayer', layer: layerA });
      store.apply({ type: 'addLayer', layer: layerB });
      const before = s(store.get());

      store.apply({ type: 'group', ids: [layerA.id, layerB.id] });
      const afterGroup = s(store.get());
      const groupId = store.get().order[0];

      store.apply({ type: 'ungroup', groupId });
      const afterUngroup = s(store.get());

      store.undo();
      if (s(store.get()) !== afterGroup) return 'ungroup undo 실패';
      store.undo();
      if (s(store.get()) !== before) return 'group undo 실패';
      store.redo();
      if (s(store.get()) !== afterGroup) return 'group redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('duplicateLayers: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.apply({ type: 'duplicateLayers', ids: [layer.id] });
      const afterDup = s(store.get());
      if (store.get().order.length !== 2) return `order 길이 오류: ${store.get().order.length}`;

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';
      store.redo();
      if (s(store.get()) !== afterDup) return 'redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('batch: 기록 1건으로 묶인다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const before = s(store.get());
      const layerA = createLayer('image');
      const layerB = createLayer('image');

      store.apply({
        type: 'batch',
        cmds: [
          { type: 'addLayer', layer: layerA },
          { type: 'addLayer', layer: layerB },
        ],
      });
      if (store.get().order.length !== 2) return 'batch 적용 실패';

      store.undo();
      if (s(store.get()) !== before) return 'batch undo 실패';
      if (store.canUndo()) return 'batch가 2건으로 기록됨';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 2. begin/preview×100/commit → 기록 1건 ──

  test('begin/preview×100/commit → 기록 1건, undo 후 시작 전과 동일', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      // 베이스 레이어 추가 (preview 대상)
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.begin('드래그');
      for (let i = 0; i < 100; i++) {
        store.preview({ type: 'setProp', id: layer.id, path: 'transform.x', value: i });
      }
      store.commit();

      // 기록 수 확인: addLayer(1) + commit(1) = 2
      store.undo(); // commit 되돌리기
      if (s(store.get()) !== before) return `commit undo 실패`;
      if (!store.canUndo()) return 'commit이 기록을 남기지 않음 — undo 스택이 비어있어야 addLayer만 남아야';
      store.undo(); // addLayer 되돌리기
      if (store.canUndo()) return 'begin/commit이 2건 이상 기록됨';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 3. cancel → 기록 0건, 시작 전과 동일 ──

  test('cancel → 기록 없음, 문서 원복', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());
      const undoCountBefore = store.canUndo(); // true (addLayer)

      store.begin('드래그');
      store.preview({ type: 'setProp', id: layer.id, path: 'transform.x', value: 999 });
      store.cancel();

      if (s(store.get()) !== before) return 'cancel 후 문서가 다름';
      // undo 스택에 cancel이 기록을 남기면 안 됨 (addLayer만 있어야)
      store.undo();
      if (store.canUndo()) return 'cancel이 기록을 남김';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 4. 알림 scope: 레이어 A 변경 시 { layer: B } 구독은 호출 안 됨 ──

  test('레이어 A 변경이 { layer: B } 구독자를 호출하지 않는다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');

      const store = createStore(createDoc());
      const layerA = createLayer('image');
      const layerB = createLayer('image');
      store.apply({ type: 'addLayer', layer: layerA });
      store.apply({ type: 'addLayer', layer: layerB });

      let callCount = 0;
      store.subscribe({ layer: layerB.id }, () => callCount++);

      store.apply({ type: 'setLayer', id: layerA.id, patch: { name: 'A변경' } });

      await new Promise(r => queueMicrotask(r));
      return callCount === 0 ? 'ok' : `호출됨 ${callCount}번`;
    });
    expect(ok).toBe('ok');
  });

  test('{ layer: A } 구독자는 A 변경 시 호출된다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');

      const store = createStore(createDoc());
      const layerA = createLayer('image');
      store.apply({ type: 'addLayer', layer: layerA });

      let callCount = 0;
      store.subscribe({ layer: layerA.id }, () => callCount++);
      store.apply({ type: 'setLayer', id: layerA.id, patch: { name: '변경' } });

      await new Promise(r => queueMicrotask(r));
      return callCount === 1 ? 'ok' : `호출 횟수: ${callCount}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 5. 한 동기 구간 apply 5번 → 알림 1번 ──

  test('동기 구간 apply 5번 → 알림 1번', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');

      const store = createStore(createDoc());
      let callCount = 0;
      store.subscribe({ any: true }, () => callCount++);

      for (let i = 0; i < 5; i++) {
        const layer = createLayer('image');
        store.apply({ type: 'addLayer', layer });
      }

      await new Promise(r => queueMicrotask(r));
      return callCount === 1 ? 'ok' : `알림 횟수: ${callCount}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 6. 기록 상한 200건 ──

  test('기록 상한 200건 — 201번째 apply 후 undo는 200번만 가능', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');

      const store = createStore(createDoc());
      for (let i = 0; i < 201; i++) {
        store.apply({ type: 'setMeta', patch: { fps: i + 1 } });
      }

      let count = 0;
      while (store.canUndo()) { store.undo(); count++; }
      return count === 200 ? 'ok' : `undo 가능 횟수: ${count}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 7. merge 옵션 ──

  test('merge: true — 같은 경로 500ms 내 apply는 기록 1건으로 합쳐진다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const before = s(store.get());

      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 10 }, { merge: true });
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 20 }, { merge: true });
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 30 }, { merge: true });

      // addLayer(1) + merged setProp(1) = 2건
      store.undo(); // merged setProp 되돌리기
      if (s(store.get()) !== before) return 'merged undo 실패';
      if (!store.canUndo()) return 'addLayer 기록이 없어짐';
      store.undo();
      if (store.canUndo()) return '기록이 3건 이상';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 8. 구독 해제 ──

  test('subscribe가 반환한 함수를 호출하면 구독이 해제된다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');

      const store = createStore(createDoc());
      let count = 0;
      const unsub = store.subscribe({ any: true }, () => count++);

      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      await new Promise(r => queueMicrotask(r));
      if (count !== 1) return `해제 전 호출 횟수 오류: ${count}`;

      unsub();
      store.apply({ type: 'setMeta', patch: { fps: 24 } });
      await new Promise(r => queueMicrotask(r));
      return count === 1 ? 'ok' : `해제 후 호출됨: ${count}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 9. removeLayers: 그룹 삭제 시 자식 승격 ──

  test('그룹 삭제 시 자식이 부모 위치로 승격된다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');

      const store = createStore(createDoc());
      const layerA = createLayer('image');
      const layerB = createLayer('image');
      store.apply({ type: 'addLayer', layer: layerA });
      store.apply({ type: 'addLayer', layer: layerB });
      store.apply({ type: 'group', ids: [layerA.id, layerB.id] });

      const groupId = store.get().order[0];
      const before = JSON.stringify(store.get().order);

      store.apply({ type: 'removeLayers', ids: [groupId] });
      const doc = store.get();

      if (doc.layers[groupId]) return '그룹이 남아있음';
      if (!doc.order.includes(layerA.id)) return 'layerA가 order에 없음';
      if (!doc.order.includes(layerB.id)) return 'layerB가 order에 없음';
      if (doc.layers[layerA.id].parentId !== null) return 'layerA parentId가 null이 아님';

      store.undo();
      if (!store.get().layers[groupId]) return 'undo 후 그룹이 없음';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 10. moveLayer ──

  test('moveLayer: undo/redo', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const s = v => JSON.stringify(v);

      const store = createStore(createDoc());
      const layerA = createLayer('image');
      const layerB = createLayer('image');
      store.apply({ type: 'addLayer', layer: layerA });
      store.apply({ type: 'addLayer', layer: layerB });
      const before = s(store.get());

      store.apply({ type: 'moveLayer', id: layerB.id, parentId: null, index: 0 });
      const afterMove = s(store.get());
      if (store.get().order[0] !== layerB.id) return 'moveLayer 실패';

      store.undo();
      if (s(store.get()) !== before) return 'undo 실패';
      store.redo();
      if (s(store.get()) !== afterMove) return 'redo 실패';
      return 'ok';
    });
    expect(ok).toBe('ok');
  });
});
