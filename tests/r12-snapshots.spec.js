// R12-3 — 작업 시점 되돌리기(자동 저장 기록). 생성 규칙·개수 상한·되돌리기 후 다시 되돌리기·
// 에셋 생존(시점이 가리키는 이미지는 시작 정리에서 지우지 않음)·replaceDoc 1건.
import { test, expect } from './helpers/fixtures.js';

test.describe('R12-3 저장 시점', () => {
  test('[정책] 생성 규칙(5분·변경)·개수 상한·수동 보존', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store); // 시작 정리(purgeOrphanAssets)가 끝난 뒤에 손댄다
    const r = await page.evaluate(async () => {
      const { shouldAutoSnapshot, pruneSnapshots, makeSnapshot, SNAPSHOT_DEFAULTS } = await import('/src/core/io/snapshots.js');
      const MIN = SNAPSHOT_DEFAULTS.minIntervalMs;
      const rules = {
        fresh5min:  shouldAutoSnapshot({ lastAt: 0, now: MIN + 1, changed: true }),       // 5분 지남 → true
        tooSoon:    shouldAutoSnapshot({ lastAt: 1000, now: 1000 + MIN - 1, changed: true }), // 5분 전 → false
        notChanged: shouldAutoSnapshot({ lastAt: 0, now: MIN * 10, changed: false }),     // 안 바뀜 → false
      };
      // 개수 상한: 자동 60개(같은 날) + 수동 2개. maxCount 30 → 자동은 30개로, 수동은 다 보존.
      const DAY = 24 * 60 * 60 * 1000;
      const now = 1000 * DAY; // 충분히 큰 기준 시각
      const list = [];
      for (let i = 0; i < 60; i++) list.push(makeSnapshot({ projectId: 'p', doc: { v: i }, auto: true, now: now - i * 60000 }));
      list.push(makeSnapshot({ projectId: 'p', doc: { v: 'm1' }, auto: false, now: now - 100 * DAY }));
      list.push(makeSnapshot({ projectId: 'p', doc: { v: 'm2' }, auto: false, now: now - 200 * DAY }));
      const { keepIds } = pruneSnapshots(list, { now });
      const keep = new Set(keepIds);
      const keptAuto = list.filter((s) => s.auto && keep.has(s.id)).length;
      const keptManual = list.filter((s) => !s.auto && keep.has(s.id)).length;

      // 바이트 상한: 큰 자동 시점이 maxBytes 넘으면 오래된 자동부터 제거(수동 유지).
      const big = [];
      const bigDoc = { pad: 'x'.repeat(2 * 1024 * 1024) }; // ~2MB 각
      for (let i = 0; i < 40; i++) big.push(makeSnapshot({ projectId: 'q', doc: bigDoc, auto: true, now: now - i * 60000 }));
      big.push(makeSnapshot({ projectId: 'q', doc: bigDoc, auto: false, now: now - 500 * DAY }));
      const pr = pruneSnapshots(big, { now, maxBytes: 20 * 1024 * 1024 });
      const keepBig = new Set(pr.keepIds);
      let bytes = 0; for (const s of big) if (keepBig.has(s.id)) bytes += s.bytes;
      const manualKeptInBig = big.filter((s) => !s.auto && keepBig.has(s.id)).length;

      return { rules, keptAuto, keptManual, total: list.length, bytes, maxBytes: 20 * 1024 * 1024, manualKeptInBig };
    });
    expect(r.rules.fresh5min).toBe(true);
    expect(r.rules.tooSoon).toBe(false);
    expect(r.rules.notChanged).toBe(false);
    expect(r.keptAuto).toBeLessThanOrEqual(30);  // 최근 30개 상한(같은 날이라 daily 추가 없음)
    expect(r.keptManual).toBe(2);                // 수동은 항상 보존
    expect(r.bytes).toBeLessThanOrEqual(r.maxBytes + 2 * 1024 * 1024); // 바이트 예산 안(마지막 1개 여유)
    expect(r.manualKeptInBig).toBe(1);           // 바이트 예산에도 수동은 안 지움
  });

  test('[되돌리기] replaceDoc 1건, 되돌린 뒤 다시 되돌리기', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store); // 시작 정리(purgeOrphanAssets)가 끝난 뒤에 손댄다
    const r = await page.evaluate(async () => {
      const { createStore } = await import('/src/core/doc/store.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const A = createDoc({ width: 32, height: 32 });
      const la = createLayer('shape', { name: 'A' }); A.layers[la.id] = la; A.order.push(la.id);
      const B = createDoc({ width: 48, height: 48 });
      const lb = createLayer('shape', { name: 'B' }); B.layers[lb.id] = lb; B.order.push(lb.id);

      const store = createStore(A);
      const d0 = store.undoDepth();
      store.apply({ type: 'replaceDoc', doc: JSON.parse(JSON.stringify(B)) });
      const added = store.undoDepth() - d0;
      const afterW = store.get().meta.width;
      const hasA = !!store.get().layers[la.id];
      const hasB = !!store.get().layers[lb.id];
      store.undo();
      const backW = store.get().meta.width;
      const backHasA = !!store.get().layers[la.id];
      return { added, afterW, hasA, hasB, backW, backHasA };
    });
    expect(r.added).toBe(1);        // 문서 교체 = 되돌리기 1건
    expect(r.afterW).toBe(48);
    expect(r.hasA).toBe(false);     // 옛 레이어는 사라지고
    expect(r.hasB).toBe(true);      // 새 레이어가 들어옴
    expect(r.backW).toBe(32);       // 되돌리면 원래 문서
    expect(r.backHasA).toBe(true);
  });

  test('[에셋 생존] 시점이 가리키는 이미지는 시작 정리에서 안 지워진다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store); // 시작 정리(purgeOrphanAssets)가 끝난 뒤에 손댄다
    const r = await page.evaluate(async () => {
      const { putProject, deleteProject, putSnapshot, getSnapshot, deleteSnapshotsByProject } = await import('/src/core/io/idb.js');
      const { putAssetBlob, hasAssetBlob, deleteAssetBlob } = await import('/src/core/io/idb.js');
      const { purgeOrphanAssets } = await import('/src/core/io/assets.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { makeSnapshot } = await import('/src/core/io/snapshots.js');

      const pid = 'prj_test_' + Math.random().toString(36).slice(2);
      const usedId = 'ast_used_' + Math.random().toString(36).slice(2);
      const orphanId = 'ast_orphan_' + Math.random().toString(36).slice(2);
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
      await putAssetBlob(usedId, blob, 0);   // 오래전 저장(정리 대상이 될 수 있게)
      await putAssetBlob(orphanId, blob, 0); // 아무도 안 쓰는 고아

      // 이미지가 든 시점(snapshot) + 현재 프로젝트는 이미지 없음.
      const docWithImg = createDoc({ width: 32, height: 32 });
      const img = createLayer('image', { name: '그림', assetId: usedId });
      docWithImg.layers[img.id] = img; docWithImg.order.push(img.id); docWithImg.assets[usedId] = { name: '그림' };
      const snap = makeSnapshot({ projectId: pid, doc: docWithImg, auto: false, now: Date.now() });
      await putSnapshot(snap);

      const docNoImg = createDoc({ width: 32, height: 32 }); // 현재 프로젝트: 이미지 지움
      await putProject({ id: pid, name: 't', doc: docNoImg, updatedAt: Date.now() });

      // 시작 정리 — 오래된 고아는 지우되 시점이 쓰는 이미지는 남긴다.
      await purgeOrphanAssets({ maxAgeMs: 0, now: Date.now() + 1 });

      const usedKept   = await hasAssetBlob(usedId);   // 시점이 가리킴 → 남아야 함
      const orphanGone = !(await hasAssetBlob(orphanId)); // 아무도 안 씀 → 지워져야 함
      const revertDoc = (await getSnapshot(snap.id))?.doc;
      const revertHasImg = !!Object.values(revertDoc.layers).find((l) => l.assetId === usedId);

      // 정리
      await deleteSnapshotsByProject(pid);
      await deleteProject(pid);
      try { await deleteAssetBlob(usedId); } catch {}
      return { usedKept, orphanGone, revertHasImg };
    });
    expect(r.usedKept).toBe(true);       // 시점이 가리키는 이미지 생존
    expect(r.orphanGone).toBe(true);     // 진짜 고아는 정리됨
    expect(r.revertHasImg).toBe(true);   // 그 시점으로 되돌리면 이미지가 doc 에 있음
  });

  test('[저장소] snapshots CRUD + byProject 목록', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store); // 시작 정리(purgeOrphanAssets)가 끝난 뒤에 손댄다
    const r = await page.evaluate(async () => {
      const { putSnapshot, listSnapshots, deleteSnapshot, deleteSnapshotsByProject } = await import('/src/core/io/idb.js');
      const pid = 'prj_crud_' + Math.random().toString(36).slice(2);
      await putSnapshot({ id: pid + '_a', projectId: pid, createdAt: 1, label: 'a', doc: {}, auto: true, bytes: 2 });
      await putSnapshot({ id: pid + '_b', projectId: pid, createdAt: 2, label: 'b', doc: {}, auto: false, bytes: 2 });
      await putSnapshot({ id: 'other_x', projectId: 'other', createdAt: 3, label: 'x', doc: {}, auto: true, bytes: 2 });
      const mine = await listSnapshots(pid);
      await deleteSnapshot(pid + '_a');
      const after = await listSnapshots(pid);
      await deleteSnapshotsByProject(pid);
      await deleteSnapshotsByProject('other');
      const empty = await listSnapshots(pid);
      return { mineCount: mine.length, afterCount: after.length, emptyCount: empty.length };
    });
    expect(r.mineCount).toBe(2);   // 내 프로젝트 것만(다른 프로젝트 제외)
    expect(r.afterCount).toBe(1);  // 하나 삭제
    expect(r.emptyCount).toBe(0);  // 프로젝트별 전체 삭제
  });
});
