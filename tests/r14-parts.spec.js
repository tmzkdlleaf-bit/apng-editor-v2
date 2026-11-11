// R14-3 — 내 부품. 저장 → 다른 프로젝트에 넣기(렌더 일치·id 충돌 없음·되돌리기 1건),
// 앱 시작 정리 후에도 부품 이미지 생존, .apnglib 내보내기·불러오기.
import { test, expect } from './helpers/fixtures.js';

// 가운데에 피벗을 둔 그룹(빨간 네모 자식) 문서를 만든다.
async function buildGroupDoc(page, D) {
  return page.evaluate(async (D) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const doc = createDoc({ width: D, height: D, fps: 12, frameCount: 2 });
    const g = createLayer('group', { name: '내그룹' });
    g.transform.x.value = D / 2; g.transform.y.value = D / 2;   // 피벗 = 가운데
    const s = createLayer('shape', { name: '네모' });
    s.shape = { kind: 'rect', w: 24, h: 24, fill: '#ff2020', stroke: null };
    s.parentId = g.id; s.transform.x.value = D / 2 + 10; s.transform.y.value = D / 2;
    g.childOrder = [s.id];
    doc.layers[g.id] = g; doc.layers[s.id] = s; doc.order.push(g.id);
    return { doc, gId: g.id, sId: s.id };
  }, D);
}

test.describe('R14-3 내 부품', () => {
  test('[저장→넣기] 다른 문서에 넣으면 렌더 일치·id 충돌 없음·되돌리기 1건', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createStore } = await import('/src/core/doc/store.js');
      const { createEditorState } = await import('/src/ui/editor-state.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { effects } = await import('/src/effects/registry.js');
      const { saveGroupAsPart, insertPartIntoDoc } = await import('/src/ui/library-parts.js');
      const { getLibraryPart, deleteLibraryPart } = await import('/src/core/io/idb.js');
      const D = 64;
      const cc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const engine = createRenderEngine({ createCanvas: cc, effects });
      const render = (doc) => { const c = cc(D, D); engine.renderFrame(c.getContext('2d', { willReadFrequently: true }), doc, 0, { scale: 1 }); return c.getContext('2d').getImageData(0, 0, D, D).data; };

      // 원본 문서(그룹) + 저장
      const docA = createDoc({ width: D, height: D });
      const g = createLayer('group', { name: '내그룹' }); g.transform.x.value = D / 2; g.transform.y.value = D / 2;
      const s = createLayer('shape', { name: '네모' }); s.shape = { kind: 'rect', w: 24, h: 24, fill: '#ff2020', stroke: null };
      s.parentId = g.id; s.transform.x.value = D / 2 + 10; s.transform.y.value = D / 2; g.childOrder = [s.id];
      docA.layers[g.id] = g; docA.layers[s.id] = s; docA.order.push(g.id);
      const storeA = createStore(docA); const esA = createEditorState(); esA.set({ selection: [g.id] });
      const refData = render(storeA.get());
      const rec = await saveGroupAsPart(storeA, esA, '내그룹부품');
      const part = await getLibraryPart(rec.id);

      // 다른(빈) 문서에 넣기
      const docB = createDoc({ width: D, height: D });
      const storeB = createStore(docB); const esB = createEditorState();
      const d0 = storeB.undoDepth();
      const newRoot = insertPartIntoDoc(storeB, esB, part);
      const added = storeB.undoDepth() - d0;
      const newData = render(storeB.get());

      // 렌더 비교(가운데 피벗이 같아 위치 이동 0 → 사실상 동일)
      let maxDiff = 0;
      for (let i = 0; i < refData.length; i++) maxDiff = Math.max(maxDiff, Math.abs(refData[i] - newData[i]));

      // id 충돌: 새 레이어 id 가 원본 id 와 겹치지 않는다.
      const aIds = new Set([g.id, s.id]);
      const bIds = Object.keys(storeB.get().layers);
      const collision = bIds.some((id) => aIds.has(id));
      const childCount = storeB.get().layers[newRoot]?.childOrder?.length ?? 0;

      await deleteLibraryPart(rec.id);
      return { maxDiff, added, collision, childCount, rootSel: esB.get().selection[0] === newRoot, bLayerCount: bIds.length };
    });
    expect(r.maxDiff).toBeLessThanOrEqual(2); // 같은 위치 → 사실상 동일
    expect(r.added).toBe(1);                  // 넣기 = 되돌리기 1건
    expect(r.collision).toBe(false);          // id 충돌 없음
    expect(r.childCount).toBe(1);             // 그룹+자식 구조 유지
    expect(r.bLayerCount).toBe(2);            // 그룹+네모
    expect(r.rootSel).toBe(true);             // 넣은 루트가 선택됨
  });

  test('[에셋 생존] 부품이 가리키는 이미지는 시작 정리에서 안 지워진다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);
    const r = await page.evaluate(async () => {
      const { putAssetBlob, hasAssetBlob, deleteAssetBlob, putLibraryPart, deleteLibraryPart } = await import('/src/core/io/idb.js');
      const { purgeOrphanAssets } = await import('/src/core/io/assets.js');
      const aid = 'ast_part_' + Math.random().toString(36).slice(2);
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
      await putAssetBlob(aid, blob, 0); // 오래전 저장(정리 대상이 될 수 있게)
      const pid = 'lib_test_' + Math.random().toString(36).slice(2);
      await putLibraryPart({ id: pid, name: '부품', createdAt: Date.now(), layers: {}, rootId: 'x', assetIds: [aid], assets: {}, thumb: null });
      await purgeOrphanAssets({ maxAgeMs: 0, now: Date.now() + 1 });
      const kept = await hasAssetBlob(aid);
      await deleteLibraryPart(pid); try { await deleteAssetBlob(aid); } catch {}
      return { kept };
    });
    expect(r.kept).toBe(true);
  });

  test('[.apnglib] 내보내기·불러오기 — 부품·에셋 복원', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { buildLibraryFile, importLibraryFile } = await import('/src/core/io/project-file.js');
      const { putAssetBlob, hasAssetBlob, deleteAssetBlob } = await import('/src/core/io/idb.js');
      const aid = 'ast_lib_' + Math.random().toString(36).slice(2);
      await putAssetBlob(aid, new Blob([new Uint8Array([9, 8, 7, 6, 5])], { type: 'image/png' }), Date.now());
      const part = { id: 'lib_x', name: '부품A', createdAt: 1, layers: { l1: { id: 'l1', type: 'group', childOrder: [] } }, rootId: 'l1', assetIds: [aid], assets: { [aid]: { type: 'image/png' } }, thumb: null };
      const file = buildLibraryFile ? await buildLibraryFile([part]) : null;
      const hadData = !!file.assets[aid]?.data;

      // 에셋을 지운 뒤 불러오면 복원되어야 한다.
      await deleteAssetBlob(aid);
      const goneBefore = !(await hasAssetBlob(aid));
      const { parts } = await importLibraryFile(file);
      const restored = await hasAssetBlob(aid);
      await deleteAssetBlob(aid);
      return { hadData, goneBefore, restored, partCount: parts.length, name: parts[0]?.name };
    });
    expect(r.hadData).toBe(true);
    expect(r.goneBefore).toBe(true);
    expect(r.restored).toBe(true);     // 불러오면 에셋 복원
    expect(r.partCount).toBe(1);
    expect(r.name).toBe('부품A');
  });
});
