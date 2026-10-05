// P7 — 저장 (IndexedDB 자동 저장 / 내용 주소 에셋 / 프로젝트 파일 / 마이그레이션)
import { test, expect } from '@playwright/test';

test.describe('P7 — 저장', () => {
  // 1. 레이어 추가·이동 → 자동 저장 → 새로고침 → 같은 문서, 이미지 바이트 유지
  test('[1] 자동 저장 → 새로고침 → 같은 문서(깊은 비교) + 이미지 유지', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__stage));

    const assetId = await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const { putAsset }    = await import('/src/core/io/assets.js');

      // 이미지 추가 (내용 주소 저장)
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const cx = c.getContext('2d'); cx.fillStyle = '#c0392b'; cx.fillRect(0, 0, 8, 8);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const { id, meta } = await putAsset(blob, '그림');
      const img = createLayer('image', { name: '그림', assetId: id });
      img.transform.x.value = 100; img.transform.y.value = 100;

      // 도형 2개 + 이미지 추가, 그다음 순서 이동
      const s1 = createLayer('shape', { name: 'A' });
      const s2 = createLayer('shape', { name: 'B' });
      window.__store.apply({ type: 'addLayer', layer: s1, index: 0 });
      window.__store.apply({ type: 'addLayer', layer: s2, index: 1 });
      window.__store.apply({ type: 'batch', cmds: [
        { type: 'addAsset', id, asset: meta },
        { type: 'addLayer', layer: img, index: 2 },
      ]});
      // 이동: A를 맨 위로
      window.__store.apply({ type: 'moveLayer', id: s1.id, parentId: null, index: 2 });
      return id;
    });

    // 자동 저장(1초 디바운스) 대기
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => JSON.stringify(window.__store.get()));

    await page.reload();
    await page.waitForFunction(() => !!(window.__store && window.__stage));

    const after = await page.evaluate(() => JSON.stringify(window.__store.get()));
    expect(after).toBe(before);

    // 이미지 바이트가 새로고침 뒤에도 IndexedDB에 있다
    const hasBytes = await page.evaluate(async (id) => {
      const { getAsset } = await import('/src/core/io/assets.js');
      const blob = await getAsset(id);
      return !!blob && blob.size > 0;
    }, assetId);
    expect(hasBytes).toBe(true);

    // 문서가 그 이미지를 여전히 가리킨다
    const refs = await page.evaluate((id) => {
      const doc = window.__store.get();
      return Object.values(doc.layers).some((l) => l.assetId === id);
    }, assetId);
    expect(refs).toBe(true);
  });

  // 2. preview(드래그) 중에는 저장 0회, apply 는 저장 호출
  test('[2] preview 중 저장 0회, apply 는 저장', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);

    const r = await page.evaluate(async () => {
      const { createStore } = await import('/src/core/doc/store.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createAutosave } = await import('/src/core/io/autosave.js');

      const store = createStore(createDoc());
      let saves = 0;
      const as = createAutosave({
        store, getProjectId: () => 'test', saveRecord: async () => { saves++; }, delay: 40,
      });

      // preview 전용 (begin → preview → cancel)
      store.begin('drag');
      store.preview({ type: 'addLayer', layer: createLayer('shape'), index: 0 });
      await new Promise((res) => setTimeout(res, 120));
      const afterPreview = saves;
      store.cancel();

      // 실제 기록
      store.apply({ type: 'addLayer', layer: createLayer('shape'), index: 0 });
      await new Promise((res) => setTimeout(res, 120));
      const afterApply = saves;

      as.destroy();
      return { afterPreview, afterApply };
    });

    expect(r.afterPreview).toBe(0);
    expect(r.afterApply).toBeGreaterThanOrEqual(1);
  });

  // 3. 같은 이미지 두 번 추가 → assets 저장소 1건 (내용 주소 중복 제거)
  test('[3] 같은 이미지 2번 → assets 1건', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);

    const r = await page.evaluate(async () => {
      const { putAsset } = await import('/src/core/io/assets.js');
      const { allAssetIds } = await import('/src/core/io/idb.js');

      function makeBlob() {
        const c = document.createElement('canvas'); c.width = c.height = 10;
        const x = c.getContext('2d'); x.fillStyle = '#27ae60'; x.fillRect(0, 0, 10, 10);
        return new Promise((res) => c.toBlob(res, 'image/png'));
      }

      const before = (await allAssetIds()).length;
      const a = await putAsset(await makeBlob(), '그림');
      const b = await putAsset(await makeBlob(), '그림 복사');
      const after = (await allAssetIds()).length;
      const all = await allAssetIds();
      return { sameId: a.id === b.id, delta: after - before, count: all.filter((x) => x === a.id).length };
    });

    expect(r.sameId).toBe(true);
    expect(r.delta).toBe(1);
    expect(r.count).toBe(1);
  });

  // 4. 내보내기 → 빈 IndexedDB에서 불러오기 → 같은 문서, 같은 렌더 픽셀
  test('[4] 내보내기 → 빈 DB 불러오기 → 같은 문서·같은 픽셀', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);

    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { putAsset, getAsset }     = await import('/src/core/io/assets.js');
      const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');
      const { clearAll }               = await import('/src/core/io/idb.js');
      const { createRenderEngine }     = await import('/src/core/render/frame.js');

      // 이미지 1개 담은 작은 문서
      const doc = createDoc({ width: 32, height: 32, fps: 12, frameCount: 2 });
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const cx = c.getContext('2d'); cx.fillStyle = '#3498db'; cx.fillRect(0, 0, 8, 8);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const { id, meta } = await putAsset(blob, '그림');
      const img = createLayer('image', { name: '그림', assetId: id });
      img.transform.x.value = 16; img.transform.y.value = 16;
      doc.layers[img.id] = img; doc.order.push(img.id); doc.assets[id] = meta;

      function createCanvas(w, h) { const cc = document.createElement('canvas'); cc.width = w; cc.height = h; return cc; }
      async function renderPixels(d) {
        const bmps = {};
        for (const aid of Object.keys(d.assets)) {
          const bl = await getAsset(aid);
          if (bl) bmps[aid] = await createImageBitmap(bl);
        }
        const assets = { getBitmap: (aid) => bmps[aid] ?? null, getAnimFrames: () => null };
        const engine = createRenderEngine({ createCanvas, assets });
        const out = createCanvas(d.meta.width, d.meta.height);
        engine.renderFrame(out.getContext('2d'), d, 0, { scale: 1 });
        return [...out.getContext('2d').getImageData(0, 0, d.meta.width, d.meta.height).data];
      }

      const payload  = await buildProjectFile(doc);
      const docJson1 = JSON.stringify(payload.doc);
      const pixels1  = await renderPixels(doc);

      // 빈 프로필 흉내: IndexedDB 비우기
      await clearAll();

      const { doc: doc2 } = await importProjectFile(payload);
      const docJson2 = JSON.stringify(doc2);
      const pixels2  = await renderPixels(doc2);

      const samePixels = pixels1.length === pixels2.length && pixels1.every((v, i) => v === pixels2[i]);
      // 픽셀이 전부 0(투명)이 아닌지 — 실제로 뭔가 그려졌는지 확인
      const drew = pixels1.some((v) => v !== 0);
      return { sameDoc: docJson1 === docJson2, samePixels, drew };
    });

    expect(r.sameDoc).toBe(true);
    expect(r.samePixels).toBe(true);
    expect(r.drew).toBe(true);
  });

  // 5. 모르는 version 파일 불러오기 → 오류 알림, 기존 작업 영향 없음
  test('[5] 모르는 version 불러오기 → 오류 알림, 작업 유지', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__project));

    // 현재 문서에 레이어 하나
    await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      window.__store.apply({ type: 'addLayer', layer: createLayer('shape', { name: '지켜야 할 레이어' }), index: 0 });
    });
    const before = await page.evaluate(() => JSON.stringify(window.__store.get()));
    const urlBefore = page.url();

    // version 999 파일을 importFile 로 — 성공 시 reload, 실패 시 toast
    await page.evaluate(async () => {
      const bad = { format: 'apng-editor-project', version: 1, doc: { version: 999, order: [], layers: {}, meta: {} }, assets: {} };
      const file = new File([JSON.stringify(bad)], '깨진.apngproj', { type: 'application/json' });
      await window.__project.importFile(file);
    });

    // 오류 토스트 표시
    await expect(page.locator('.app-toast.show')).toBeVisible();
    await expect(page.locator('.app-toast')).toContainText('불러올 수 없');

    // 새로고침 없음(작업 유지) — 문서 그대로
    expect(page.url()).toBe(urlBefore);
    const after = await page.evaluate(() => JSON.stringify(window.__store.get()));
    expect(after).toBe(before);
  });

  // 6. migrate: v1 통과, 모르는 버전/누락 → 오류
  test('[6] migrate — v1 통과, 모르는 버전 오류', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { migrate, CURRENT_VERSION } = await import('/src/core/io/migrate.js');
      const ok = migrate({ version: 1, order: [], layers: {} });
      let threwFuture = false, threwNoVer = false;
      try { migrate({ version: 999 }); } catch { threwFuture = true; }
      try { migrate({ nope: true }); } catch { threwNoVer = true; }
      return { okVersion: ok.version, CURRENT_VERSION, threwFuture, threwNoVer };
    });
    expect(r.okVersion).toBe(1);
    expect(r.CURRENT_VERSION).toBe(1);
    expect(r.threwFuture).toBe(true);
    expect(r.threwNoVer).toBe(true);
  });

  // 7. 값 하나 바꾸고 바로 새 프로젝트 → 이전 프로젝트 레코드에 그 변경이 저장돼 있다
  test('[7] setProp 직후 새 프로젝트 → 이전 레코드에 값 반영', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__project && window.__autosave));

    const r = await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const { getProject }  = await import('/src/core/io/idb.js');
      const oldId = localStorage.getItem('apng2.currentProject');

      // 레이어 하나 추가하고 저장이 끝나길 기다린다
      const layer = createLayer('shape', { name: '값바꿈' });
      window.__store.apply({ type: 'addLayer', layer, index: 0 });
      await window.__autosave.flush({ withThumb: false });

      // reload를 막아 전환 직전의 flush만 검증한다
      const origReload = location.reload.bind(location);
      location.reload = () => {};
      try {
        // 값 하나 바꾸고 디바운스(1초) 안에 바로 새 프로젝트
        window.__store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 123 });
        await window.__project.newProject();
      } finally {
        location.reload = origReload;
      }

      const rec = await getProject(oldId);
      return { saved: rec?.doc?.layers?.[layer.id]?.transform?.x?.value ?? null };
    });

    expect(r.saved).toBe(123);
  });

  // 8. 열린 드래그(begin~commit) 중 flush는 preview 값을 저장하지 않고 commit 뒤로 미룬다
  test('[8] 드래그 중에는 preview 값 저장 안 함, commit 뒤 저장', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);

    const r = await page.evaluate(async () => {
      const { createStore }            = await import('/src/core/doc/store.js');
      const { createDoc, createLayer }  = await import('/src/core/doc/schema.js');
      const { createAutosave }          = await import('/src/core/io/autosave.js');
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

      const store = createStore(createDoc());
      let lastSaved = null;
      const as = createAutosave({
        store, getProjectId: () => 'test',
        saveRecord: async (rec) => { lastSaved = rec; }, delay: 60,
      });

      const layer = createLayer('shape', { name: '드래그' });
      layer.transform.x.value = 10;
      store.apply({ type: 'addLayer', layer, index: 0 });
      await sleep(150);                       // 첫 저장 완료 (x=10)

      // 값 바꿔 저장을 예약한 직후(디바운스 안) 드래그 시작 → 타이머가 드래그 중 발화
      store.apply({ type: 'setProp', id: layer.id, path: 'transform.x', value: 20 });
      store.begin('drag');
      store.preview({ type: 'setProp', id: layer.id, path: 'transform.x', value: 999 });
      await sleep(250);                       // delay(60) 여러 번 지남 — 그래도 저장 안 돼야
      const duringX = lastSaved?.doc?.layers?.[layer.id]?.transform?.x?.value ?? null;

      store.commit();
      await sleep(250);                       // 커밋 뒤에는 최종값 저장
      const afterX = lastSaved?.doc?.layers?.[layer.id]?.transform?.x?.value ?? null;

      as.destroy();
      return { duringX, afterX };
    });

    expect(r.duringX).toBe(10);   // 드래그 중 저장된 값은 커밋 전 값 — preview(999) 아님
    expect(r.afterX).toBe(999);   // 커밋 뒤에는 preview 최종값이 저장됨
  });
});
