// R7 — 2차 전체 검토에서 실제로 돌려 확인한 버그 재현(고치면 통과).
// R7-1·R7-2는 dist 를 두 번 빌드해야 재현돼 별도(tests/sw/)로 뺐다.
import { test, expect } from '@playwright/test';

test.describe('R7 재현', () => {
  // ── R7-3: 다른 프로젝트를 지워도 되돌리기로 살릴 이미지는 남아야 한다(데이터 손실) ──
  test('[R7-3] 다른 프로젝트 삭제 → 되돌리기로 이미지 복구', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__project && window.__autosave));

    const r = await page.evaluate(async () => {
      const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
      const { putAsset, getAsset } = await import('/src/core/io/assets.js');
      const { putProject } = await import('/src/core/io/idb.js');

      // 이 이미지를 가리키지 않는 다른 프로젝트 하나를 저장소에 둔다.
      await putProject({ id: 'r7_other', name: '다른 프로젝트', doc: createDoc(), updatedAt: Date.now() });

      // 현재 프로젝트에 이미지 레이어 추가 + 저장
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const cx = c.getContext('2d'); cx.fillStyle = '#e74c3c'; cx.fillRect(0, 0, 8, 8);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const { id: assetId, meta } = await putAsset(blob, '그림');
      const img = createLayer('image', { name: '그림', assetId });
      window.__store.apply({ type: 'batch', cmds: [
        { type: 'addAsset', id: assetId, asset: meta },
        { type: 'addLayer', layer: img, index: 0 },
      ] });
      await window.__autosave.flush({ withThumb: false });

      // 이미지 레이어 삭제 → 저장(저장된 현재 문서는 더 이상 이 이미지를 가리키지 않는다)
      window.__store.apply({ type: 'removeLayers', ids: [img.id] });
      await window.__autosave.flush({ withThumb: false });

      // 다른 프로젝트 삭제(현재 프로젝트가 아니므로 reload 없음)
      await window.__project.deleteProject('r7_other');
      const afterDelete = !!(await getAsset(assetId));

      // 되돌리기 → 레이어 복구 + 이미지 바이트 유지
      window.__store.undo();
      const back = window.__store.get().layers[img.id];
      const stillHasBytes = !!(await getAsset(assetId));
      return { afterDelete, restored: back?.assetId === assetId, stillHasBytes };
    });

    expect(r.afterDelete).toBe(true);    // 삭제가 이 이미지를 지우지 않았다
    expect(r.restored).toBe(true);       // 되돌리기로 레이어가 돌아왔다
    expect(r.stillHasBytes).toBe(true);  // 돌아온 레이어의 이미지가 여전히 있다
  });

  // ── R7-4: 레이어 이름 바꾸기는 되돌리기 1건 ──
  test('[R7-4] 이름 바꾸기 되돌리기 1건', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__stage));

    const layerId = await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const l = createLayer('shape', { name: '원래' });
      window.__store.apply({ type: 'addLayer', layer: l, index: 0 });
      window.__editorState.set({ selection: [l.id] });
      return l.id;
    });
    const depth0 = await page.evaluate(() => window.__store.undoDepth());

    await page.locator(`.tl-row[data-id="${layerId}"] .tl-name`).dblclick();
    const input = page.locator('.tl-name-edit');
    await input.fill('바뀐이름');
    await input.press('Enter');
    await page.waitForTimeout(120);

    const r = await page.evaluate((id) => ({
      name: window.__store.get().layers[id].name,
      depth: window.__store.undoDepth(),
    }), layerId);
    expect(r.name).toBe('바뀐이름');
    expect(r.depth - depth0).toBe(1); // 기록 1건(2건 아님)

    await page.evaluate(() => window.__store.undo());
    const back = await page.evaluate((id) => window.__store.get().layers[id].name, layerId);
    expect(back).toBe('원래');
  });

  // ── R7-5: 빠른 GIF 지연(≤10ms)은 100ms 로 보정(브라우저와 같은 규칙). APNG 는 그대로 ──
  test('[R7-5] GIF 지연 ≤10ms → 100ms, APNG 는 그대로', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);

    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { decodeAnim } = await import('/src/core/io/anim-decode.js');

      // fps 100 → 프레임당 10ms(GIF 최소 1 centisecond). 보정 전이면 10ms 로 읽힌다.
      const doc = H.movingShapeDoc({ fps: 100, frameCount: 3 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, playback: 'loop' });

      const { buf: gbuf }  = await encode(baked, 'gif', { loops: 0 }, {});
      const gif  = await decodeAnim(new Blob([gbuf], { type: 'image/gif' }));
      const { buf: abuf }  = await encode(baked, 'apng', { loops: 0 }, {});
      const apng = await decodeAnim(new Blob([abuf], { type: 'image/png' }));

      return { gifDelays: gif?.delays ?? null, apngDelays: apng?.delays ?? null };
    });

    expect(Array.isArray(r.gifDelays)).toBe(true);
    expect(r.gifDelays.every((d) => d === 100)).toBe(true); // 전부 100 으로 보정
    expect(Array.isArray(r.apngDelays)).toBe(true);
    expect(r.apngDelays.some((d) => d < 100)).toBe(true);    // APNG 는 손대지 않음
  });

  // ── R7-6: 망가진 문서(카메라·transform 없음, 알 수 없는 종류)는 정리 후 그려야 한다 ──
  test('[R7-6] 깨진 문서 정리 후 렌더 성공', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__store);

    const r = await page.evaluate(async () => {
      const { importProjectFile } = await import('/src/core/io/project-file.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const H = await import('/tests/e1-helpers.js');

      const bad = {
        format: 'apng-editor-project', version: 1,
        doc: {
          version: 2,
          meta: { width: 32, height: 32, fps: 12, frameCount: 2 }, // camera 없음
          order: ['a', 'b', 'ghost'],                              // ghost = 없는 레이어
          layers: {
            a: { id: 'a', type: 'shape', name: '네모', shape: { kind: 'rect', w: 20, h: 20, fill: '#0099ff' } }, // transform 없음
            b: { id: 'b', type: 'wat', name: '수상한것' }, // 알 수 없는 종류
          },
        },
        assets: {},
      };
      const { doc } = await importProjectFile(bad);

      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const out = H.createCanvas(32, 32);
      let threw = false;
      try { engine.renderFrame(out.getContext('2d'), doc, 0, { scale: 1 }); }
      catch { threw = true; }
      const px = [...out.getContext('2d').getImageData(0, 0, 32, 32).data];
      return {
        hasCamera:    !!(doc.camera && doc.camera.x),
        hasTransform: !!(doc.layers.a && doc.layers.a.transform && doc.layers.a.transform.x),
        droppedUnknown: !('b' in doc.layers),
        orderCleaned: doc.order.every((id) => id in doc.layers),
        threw,
        drew: px.some((v) => v !== 0),
      };
    });

    expect(r.hasCamera).toBe(true);
    expect(r.hasTransform).toBe(true);
    expect(r.droppedUnknown).toBe(true);
    expect(r.orderCleaned).toBe(true);
    expect(r.threw).toBe(false);
    expect(r.drew).toBe(true);
  });

  // ── R7-7: 레이어 이름이 HTML 로 해석되지 않아야 한다(공유 파일 안전) ──
  test('[R7-7] 레이어 이름은 글자로만 들어간다(루프 검사 창)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__stage));

    await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const l = createLayer('shape', { name: '<b class="r7-inj">굵게</b>' });
      window.__store.apply({ type: 'addLayer', layer: l, index: 0 });
      const fc = window.__store.get().meta.frameCount;
      // 시작·끝이 다른 x 키 → 이음새 문제로 목록에 뜨게
      window.__store.apply({ type: 'setProp', id: l.id, path: 'transform.x', value: 0, f: 0 });
      window.__store.apply({ type: 'setProp', id: l.id, path: 'transform.x', value: 100, f: fc });
    });

    await page.evaluate(async () => {
      const { openLoopCheck } = await import('/src/ui/loop-check.js');
      openLoopCheck(window.__store, window.__editorState);
    });
    await expect(page.locator('.loopcheck-row')).toBeVisible();

    const injected = await page.locator('.loopcheck-row .r7-inj').count();
    const text = await page.locator('.loopcheck-row .lc-name').first().innerText();
    expect(injected).toBe(0);         // 진짜 <b> 요소가 아니다
    expect(text).toContain('<b');     // 글자 그대로 들어갔다
  });
});
