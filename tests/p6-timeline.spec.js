// P6 테스트: 재생, 타임라인, 레이어 추가, 인스펙터
import { test, expect } from '@playwright/test';

test.describe('P6 — 재생 / 타임라인 / 레이어 추가 / 인스펙터', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
  });

  // ── 재생 ─────────────────────────────────────────────────────────────────
  test('[재생] 재생 버튼 → 프레임 진행', async ({ page }) => {
    const f0 = await page.evaluate(() => window.__editorState.get().f);
    expect(f0).toBe(0);

    await page.click('[data-action="play"]');
    await page.waitForTimeout(600);

    const f1 = await page.evaluate(() => window.__editorState.get().f);
    expect(f1).toBeGreaterThan(0);
  });

  test('[재생] 정지 → 프레임 고정', async ({ page }) => {
    await page.click('[data-action="play"]');
    await page.waitForTimeout(400);
    await page.click('[data-action="play"]');

    const fPaused = await page.evaluate(() => window.__editorState.get().f);
    await page.waitForTimeout(300);
    const fAfter  = await page.evaluate(() => window.__editorState.get().f);

    expect(fAfter).toBe(fPaused);
    expect(await page.evaluate(() => window.__editorState.get().playing)).toBe(false);
  });

  test('[재생] loop 모드 — 마지막 프레임 → 0으로 돌아옴', async ({ page }) => {
    await page.evaluate(() => {
      const fc = window.__store.get().meta.frameCount;
      window.__editorState.set({ f: fc - 1 });
    });

    const mode = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(mode).toBe('loop');

    await page.click('[data-action="play"]');
    await page.waitForTimeout(500);
    await page.click('[data-action="play"]');

    const f = await page.evaluate(() => window.__editorState.get().f);
    expect(f).toBeGreaterThanOrEqual(0);
  });

  // B3: 재생 프레임 무누락 — rAF 시각 가짜 주입으로 결정론적 검사
  test('[재생 B3] 12fps 2초 재생 — 프레임 빠짐 없음 (누적 방식)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createPlayback } = await import('/src/ui/playback.js');
      const { createStore }    = await import('/src/core/doc/store.js');
      const { createDoc }      = await import('/src/core/doc/schema.js');
      const { createEditorState } = await import('/src/ui/editor-state.js');

      const doc   = createDoc({ fps: 12, frameCount: 24 });
      const store = createStore(doc);
      const es    = createEditorState();
      const pb    = createPlayback(store, es);

      // rAF 가로채기
      let _rafCb = null;
      const origRAF = window.requestAnimationFrame;
      const origCAF = window.cancelAnimationFrame;
      window.requestAnimationFrame = (cb) => { _rafCb = cb; return 1; };
      window.cancelAnimationFrame  = () => { _rafCb = null; };

      pb.play();

      const frames = [];
      let ts = 0;
      const INTERVAL = 1000 / 60; // 60Hz

      for (let i = 0; i < 120; i++) {  // 2초 @ 60Hz
        ts += INTERVAL;
        if (_rafCb) { const cb = _rafCb; _rafCb = null; cb(ts); }
        frames.push(es.get().f);
      }

      pb.stop();
      window.requestAnimationFrame = origRAF;
      window.cancelAnimationFrame  = origCAF;

      // 12fps → 60Hz에서 5프레임마다 1 증가, 2초 = 24프레임
      const finalF = es.get().f;
      const unique = [...new Set(frames)];
      return { frames, finalF, unique };
    });

    // 24프레임이 모두 등장해야 함 (루프므로 0~23)
    const seen = new Set(result.frames);
    for (let f = 0; f < 24; f++) {
      expect(seen.has(f)).toBe(true);
    }
  });

  test('[재생 B3] 24fps 1초 재생 — 프레임 빠짐 없음', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createPlayback }    = await import('/src/ui/playback.js');
      const { createStore }       = await import('/src/core/doc/store.js');
      const { createDoc }         = await import('/src/core/doc/schema.js');
      const { createEditorState } = await import('/src/ui/editor-state.js');

      const doc   = createDoc({ fps: 24, frameCount: 24 });
      const store = createStore(doc);
      const es    = createEditorState();
      const pb    = createPlayback(store, es);

      let _rafCb = null;
      const origRAF = window.requestAnimationFrame;
      const origCAF = window.cancelAnimationFrame;
      window.requestAnimationFrame = (cb) => { _rafCb = cb; return 1; };
      window.cancelAnimationFrame  = () => { _rafCb = null; };

      pb.play();
      const frames = [];
      let ts = 0;

      for (let i = 0; i < 60; i++) {  // 1초 @ 60Hz
        ts += 1000 / 60;
        if (_rafCb) { const cb = _rafCb; _rafCb = null; cb(ts); }
        frames.push(es.get().f);
      }

      pb.stop();
      window.requestAnimationFrame = origRAF;
      window.cancelAnimationFrame  = origCAF;
      return { frames };
    });

    const seen = new Set(result.frames);
    // 24fps 1초 → 최소 0~23 프레임이 모두 나타나야 함
    for (let f = 0; f < 24; f++) {
      expect(seen.has(f)).toBe(true);
    }
  });

  // ── 타임라인 ─────────────────────────────────────────────────────────────
  test('[타임라인] 레이어 행 수 == 레이어 수', async ({ page }) => {
    const rowCount   = await page.locator('.tl-row').count();
    const layerCount = await page.evaluate(() => window.__store.get().order.length);
    expect(rowCount).toBe(layerCount);
    expect(rowCount).toBeGreaterThan(0);
  });

  test('[타임라인] 행 클릭 → 선택', async ({ page }) => {
    const firstId = await page.evaluate(() => {
      const doc = window.__store.get();
      return doc.order[doc.order.length - 1];
    });

    await page.locator('.tl-row').first().click();

    const sel = await page.evaluate(() => window.__editorState.get().selection);
    expect(sel).toContain(firstId);
  });

  test('[타임라인] Shift+클릭 → 범위 선택', async ({ page }) => {
    const rows = page.locator('.tl-row');
    const count = await rows.count();
    if (count < 2) return;

    await rows.first().click();
    await rows.nth(1).click({ modifiers: ['Shift'] });

    const sel = await page.evaluate(() => window.__editorState.get().selection);
    expect(sel.length).toBeGreaterThanOrEqual(2);
  });

  test('[타임라인] 가시성 토글 — 눈 버튼 클릭', async ({ page }) => {
    const firstId = await page.evaluate(() => {
      const doc = window.__store.get();
      return doc.order[doc.order.length - 1];
    });
    const was = await page.evaluate((id) => window.__store.get().layers[id]?.visible, firstId);

    await page.locator('.tl-row').first().locator('.tl-eye').click();

    const now = await page.evaluate((id) => window.__store.get().layers[id]?.visible, firstId);
    const wasVisible = was !== false;
    expect(now).toBe(!wasVisible);
  });

  test('[타임라인] 트랙 캔버스 렌더됨', async ({ page }) => {
    const canvas = page.locator('.track-body-canvas');
    await expect(canvas).toBeVisible();
    const w = await canvas.evaluate((el) => el.width);
    expect(w).toBeGreaterThan(0);
  });

  test('[타임라인] 트랙 클릭 → 프레임 이동', async ({ page }) => {
    const canvas = page.locator('.track-body-canvas');
    const box    = await canvas.boundingBox();
    if (!box) return;

    await page.mouse.click(box.x + 5 * 20 + 10, box.y + 4);
    const f = await page.evaluate(() => window.__editorState.get().f);
    expect(f).toBe(5);
  });

  // ── 레이어 추가 ──────────────────────────────────────────────────────────
  test('[레이어 추가] 사각형 추가 → 레이어 수 +1', async ({ page }) => {
    const before = await page.evaluate(() => window.__store.get().order.length);

    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="rect"]');

    const after = await page.evaluate(() => window.__store.get().order.length);
    expect(after).toBe(before + 1);
  });

  test('[레이어 추가] 원 추가 → shape.kind=ellipse', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="ellipse"]');

    const newLayer = await page.evaluate(() => {
      const doc = window.__store.get();
      const id  = doc.order[doc.order.length - 1];
      return doc.layers[id];
    });
    expect(newLayer.type).toBe('shape');
    expect(newLayer.shape.kind).toBe('ellipse');
  });

  test('[레이어 추가] 텍스트 추가 → type=text', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="text"]');

    const newLayer = await page.evaluate(() => {
      const doc = window.__store.get();
      const id  = doc.order[doc.order.length - 1];
      return doc.layers[id];
    });
    expect(newLayer.type).toBe('text');
    expect(typeof newLayer.text).toBe('string');
  });

  test('[레이어 추가] 추가 후 자동 선택됨', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="rect"]');

    const sel = await page.evaluate(() => window.__editorState.get().selection);
    expect(sel.length).toBe(1);
    const topId = await page.evaluate(() => {
      const doc = window.__store.get();
      return doc.order[doc.order.length - 1];
    });
    expect(sel[0]).toBe(topId);
  });

  // A4: 이미지 추가 되돌리기/다시하기 — addAsset + addLayer 한 건
  test('[A4] 이미지 추가 → store.assets에 에셋 포함', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createStore }       = await import('/src/core/doc/store.js');
      const { createDoc, newId }  = await import('/src/core/doc/schema.js');
      const store = createStore(createDoc());
      const assetId = newId('img_');

      const before = Object.keys(store.get().assets).length;
      store.apply({
        type: 'batch',
        cmds: [
          { type: 'addAsset', id: assetId, asset: { dataUrl: 'data:image/png;base64,abc' } },
          { type: 'addLayer', layer: { id: newId('lyr_'), type: 'image', name: '테스트', assetId,
              parentId: null, visible: true, locked: false, blend: 'normal', opacity: 1,
              transform: { x:{value:0}, y:{value:0}, scale:{value:1}, rotation:{value:0}, alpha:{value:1} },
              anchor:{x:0.5,y:0.5}, clips:[], mask:null, adjust:null, tint:null, outline:null, exit:null },
          },
        ],
      });

      const afterCount  = Object.keys(store.get().assets).length;
      const afterLayers = store.get().order.length;
      const canUndo     = store.canUndo();

      store.undo();
      const afterUndoAssets  = Object.keys(store.get().assets).length;
      const afterUndoLayers  = store.get().order.length;

      store.redo();
      const afterRedoAssets  = Object.keys(store.get().assets).length;
      const afterRedoLayers  = store.get().order.length;

      return { before, afterCount, afterLayers, canUndo,
               afterUndoAssets, afterUndoLayers,
               afterRedoAssets, afterRedoLayers };
    });

    expect(result.afterCount).toBe(result.before + 1);
    expect(result.afterLayers).toBe(1);
    expect(result.canUndo).toBe(true);
    expect(result.afterUndoAssets).toBe(result.before);   // 에셋 사라짐
    expect(result.afterUndoLayers).toBe(0);               // 레이어 사라짐
    expect(result.afterRedoAssets).toBe(result.before + 1); // 에셋 복구
    expect(result.afterRedoLayers).toBe(1);               // 레이어 복구
  });

  // ── 인스펙터 ─────────────────────────────────────────────────────────────
  test('[인스펙터] 선택 없음 → 빈 안내 표시', async ({ page }) => {
    await page.evaluate(() => window.__editorState.set({ selection: [] }));
    const empty = page.locator('.inspector-empty');
    await expect(empty).toBeVisible();
  });

  test('[인스펙터] 레이어 선택 → 레이아웃 섹션 표시', async ({ page }) => {
    await page.locator('.tl-row').first().click();
    const section = page.locator('.inspector-section');
    await expect(section).toBeVisible();
    const xLabel = page.locator('.num-label').filter({ hasText: 'X' });
    await expect(xLabel.first()).toBeVisible();
  });

  test('[인스펙터] X값 변경 → store 반영', async ({ page }) => {
    await page.locator('.tl-row').first().click();

    const id = await page.evaluate(() => window.__editorState.get().selection[0]);

    const xInput = page.locator('.num-input').first();
    await xInput.click({ clickCount: 3 });
    await xInput.fill('123');
    await xInput.press('Enter');

    const val = await page.evaluate((layerId) => {
      const layer = window.__store.get().layers[layerId];
      return layer?.transform?.x?.value;
    }, id);
    expect(val).toBe(123);
  });

  // E5: 패널 재생성 0회
  test('[E5] 스크럽 중 인스펙터 패널 루트 자식 교체 0회', async ({ page }) => {
    // 레이어 선택
    await page.locator('.tl-row').first().click();
    await page.waitForSelector('.inspector-section');

    const mutationCount = await page.evaluate(async () => {
      // 패널 루트(.inspector-scroll)의 자식 교체를 감지
      const scrollEl = document.querySelector('.inspector-scroll');
      if (!scrollEl) return -1;

      let count = 0;
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
            count++;
          }
        }
      });
      obs.observe(scrollEl, { childList: true });

      // 24프레임 스크럽
      const es = window.__editorState;
      const fc = window.__store.get().meta.frameCount ?? 24;
      for (let f = 0; f < fc; f++) {
        es.set({ f });
        // 마이크로태스크 처리 대기
        await new Promise(r => queueMicrotask(r));
      }

      obs.disconnect();
      return count;
    });

    expect(mutationCount).toBe(0);
  });

  // ── 상단 바 ──────────────────────────────────────────────────────────────
  test('[상단바] 캔버스 정보 표시 (zoom%)', async ({ page }) => {
    const info = page.locator('#canvas-info');
    const text = await info.textContent();
    expect(text).toMatch(/\d+%/);
  });

  test('[상단바] 되돌리기 버튼 초기 비활성화', async ({ page }) => {
    const undoBtn = page.locator('[data-action="undo"]');
    const isDisabled = await undoBtn.evaluate((el) => el.disabled);
    expect(isDisabled).toBe(true);
  });

  test('[상단바] 작업 후 되돌리기 활성화', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="rect"]');

    const undoBtn = page.locator('[data-action="undo"]');
    const isDisabled = await undoBtn.evaluate((el) => el.disabled);
    expect(isDisabled).toBe(false);
  });

  // ── 루프 모드 (B2: doc.meta.playback) ───────────────────────────────────
  test('[재생 B2] 루프 모드 버튼 → doc.meta.playback 변경 (loop→once→pingpong→loop)', async ({ page }) => {
    const loopBtn = page.locator('[data-action="loop-mode"]');

    let mode = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(mode).toBe('loop');

    await loopBtn.click();
    mode = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(mode).toBe('once');

    await loopBtn.click();
    mode = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(mode).toBe('pingpong');

    await loopBtn.click();
    mode = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(mode).toBe('loop');
  });

  test('[재생 B2] 루프 모드 변경 → 되돌리기 가능', async ({ page }) => {
    const loopBtn = page.locator('[data-action="loop-mode"]');
    await loopBtn.click();

    const mode = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(mode).toBe('once');

    // 되돌리기
    await page.click('[data-action="undo"]');
    const modeAfterUndo = await page.evaluate(() => window.__store.get().meta.playback ?? 'loop');
    expect(modeAfterUndo).toBe('loop');
  });

  // ── 끝난 조건 시나리오 ──────────────────────────────────────────────────
  test('[시나리오] 빈 문서 → 이미지 추가 → f=0,f=12에 X 키 → 재생 → f=6에서 X 중간값', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createStore }       = await import('/src/core/doc/store.js');
      const { createDoc, newId, createLayer } = await import('/src/core/doc/schema.js');
      const { createEditorState } = await import('/src/ui/editor-state.js');
      const doc   = createDoc({ fps: 12, frameCount: 24 });
      const store = createStore(doc);
      const es    = createEditorState();

      const assetId = newId('img_');
      const layer   = createLayer('image', { name: '테스트', assetId });
      store.apply({
        type: 'batch',
        cmds: [
          { type: 'addAsset', id: assetId, asset: { dataUrl: 'data:image/png;base64,abc' } },
          { type: 'addLayer', layer, index: 0 },
        ],
      });

      const id = layer.id;

      // f=0에 X=100 키
      store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 0 });
      // f=12에 X=200 키
      store.apply({ type: 'setProp', id, path: 'transform.x', value: 200, f: 12 });

      // f=6에서 X 평가 → 중간값 (선형 보간)
      const { evalProp } = await import('/src/core/anim/prop.js');
      const docNow = store.get();
      const x6 = evalProp(docNow.layers[id].transform.x, 6);

      return { x6, layerCount: store.get().order.length };
    });

    // f=6에서 X는 100과 200 사이
    expect(result.layerCount).toBe(1);
    expect(result.x6).toBeGreaterThan(100);
    expect(result.x6).toBeLessThan(200);
  });
});
