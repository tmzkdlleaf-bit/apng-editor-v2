// P6 보완2 테스트 (항목 13-18)
import { test, expect } from '@playwright/test';

test.describe('P6 보완2 — 타임라인 키 / 그룹 / 정렬 / 혼합', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
  });

  // 레이어 id 헬퍼 (표시 역순에서 이름으로 찾기)
  async function layerIdByName(page, name) {
    return page.evaluate((n) => {
      const doc = window.__store.get();
      for (const id of doc.order) if (doc.layers[id].name === n) return id;
      return null;
    }, name);
  }

  // 트랙 바디에서 특정 레이어 행의 화면 좌표(프레임 f)
  async function bodyPoint(page, layerId, f) {
    const box = await page.locator('.track-body-canvas').boundingBox();
    const info = await page.evaluate((id) => {
      const doc  = window.__store.get();
      const rows = [...doc.order].reverse();
      // 카메라 행 여부
      const cam = doc.camera;
      const camKeys = !!(cam?.x?.keys?.length || cam?.y?.keys?.length || cam?.zoom?.keys?.length);
      let idx = rows.indexOf(id);
      if (camKeys) idx += 1;
      return { idx, ROW_H: 28 };
    }, layerId);
    return {
      x: box.x + f * 20 + 10,
      y: box.y + info.idx * info.ROW_H + 14,
      boxX: box.x, boxY: box.y, idx: info.idx,
    };
  }

  // 13. 키 박스 선택 → 복사 → 다른 f에 붙여넣기 → 상대 간격 유지
  test('[13] 키 박스 선택 → 복사 → 다른 f 붙여넣기 (상대 간격)', async ({ page }) => {
    const rectId = await layerIdByName(page, '사각형');
    await page.evaluate((id) => {
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 0 });
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 200, f: 10 });
    }, rectId);

    const p = await bodyPoint(page, rectId, 0);
    // 박스: 빈 곳(프레임0 다이아 왼쪽)에서 시작 → f=10 다이아 너머까지
    await page.mouse.move(p.boxX + 2, p.y);
    await page.mouse.down();
    await page.mouse.move(p.boxX + 220, p.y, { steps: 8 });
    await page.mouse.up();

    const selCount = await page.evaluate(() => window.__editorState.get().kfSelection.length);
    expect(selCount).toBe(2);

    await page.keyboard.press('Control+c');
    await page.evaluate(() => window.__editorState.set({ f: 5 }));
    await page.keyboard.press('Control+v');

    const frames = await page.evaluate((id) => {
      return window.__store.get().layers[id].transform.x.keys.map(k => k.f).sort((a, b) => a - b);
    }, rectId);
    // 원래 0,10 + 붙여넣기 5,15 (상대 간격 10 유지)
    expect(frames).toContain(5);
    expect(frames).toContain(15);
  });

  // 14. 레이어 끌어서 그룹 안으로 → parentId 변경, 되돌리면 원래대로
  test('[14] 그룹으로 이동 → parentId 변경, 되돌리기 복원', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createStore }      = await import('/src/core/doc/store.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc   = createDoc();
      const store = createStore(doc);

      const g = createLayer('group', { name: '그룹', childOrder: [] });
      const a = createLayer('shape', { name: '사각형' });
      store.apply({ type: 'addLayer', layer: g, index: 0 });
      store.apply({ type: 'addLayer', layer: a, index: 1 });

      const beforeParent = store.get().layers[a.id].parentId;
      const beforeOrder  = store.get().order.includes(a.id);

      // 드래그 결과와 동일한 명령
      store.apply({ type: 'moveLayer', id: a.id, parentId: g.id, index: 0 });
      const afterParent = store.get().layers[a.id].parentId;
      const afterInGroup = (store.get().layers[g.id].childOrder ?? []).includes(a.id);
      const afterTopOrder = store.get().order.includes(a.id);

      store.undo();
      const undoParent = store.get().layers[a.id].parentId;
      const undoTopOrder = store.get().order.includes(a.id);

      return { beforeParent, beforeOrder, afterParent, afterInGroup, afterTopOrder,
               undoParent, undoTopOrder, gid: g.id };
    });

    expect(result.beforeParent).toBe(null);
    expect(result.beforeOrder).toBe(true);
    expect(result.afterParent).toBe(result.gid);
    expect(result.afterInGroup).toBe(true);
    expect(result.afterTopOrder).toBe(false);
    expect(result.undoParent).toBe(null);
    expect(result.undoTopOrder).toBe(true);
  });

  // 15. 이징 메뉴 → 키 ease 변경, 기록 1건
  test('[15] 우클릭 이징 메뉴 → ease 변경, 1건', async ({ page }) => {
    const rectId = await layerIdByName(page, '사각형');
    await page.evaluate((id) => {
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 5 });
    }, rectId);

    const undoBefore = await page.evaluate(() => {
      // 되돌리기 가능 횟수 비교용 — 키 추가로 이미 1건
      let n = 0; while (window.__store.canUndo()) { window.__store.undo(); n++; }
      // 복원
      while (window.__store.canRedo()) window.__store.redo();
      return n;
    });

    const p = await bodyPoint(page, rectId, 5);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForSelector('.kf-ease-menu', { state: 'visible' });
    await page.locator('.kf-ease-item', { hasText: '천천히 시작' }).first().click();

    const ease = await page.evaluate((id) => {
      return window.__store.get().layers[id].transform.x.keys.find(k => k.f === 5)?.ease;
    }, rectId);
    expect(ease).toBe('easeIn');

    const afterUndo = await page.evaluate((id) => {
      window.__store.undo(); // ease 변경 1건만 되돌림
      return window.__store.get().layers[id].transform.x.keys.find(k => k.f === 5)?.ease;
    }, rectId);
    expect(afterUndo).toBe('linear');
  });

  // 16. 마름모 클릭 → 키 생성/삭제
  test('[16] 배치 마름모 클릭 → 키 생성·삭제', async ({ page }) => {
    const rectId = await layerIdByName(page, '사각형');
    await page.evaluate((id) => window.__editorState.set({ selection: [id], f: 0 }), rectId);
    await page.waitForSelector('.kf-diamond');

    const dia = page.locator('.kf-diamond').first(); // X
    await dia.click();
    let has = await page.evaluate((id) => (window.__store.get().layers[id].transform.x.keys ?? []).some(k => k.f === 0), rectId);
    expect(has).toBe(true);

    await dia.click();
    has = await page.evaluate((id) => (window.__store.get().layers[id].transform.x.keys ?? []).some(k => k.f === 0), rectId);
    expect(has).toBe(false);
  });

  // 17. 혼합 표시 → 입력 → 두 레이어 모두 변경, 기록 1건
  test('[17] 혼합 값 → 입력 → 전부 변경, 1건', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');
    await page.evaluate(([a, b]) => window.__editorState.set({ selection: [a, b], f: 0 }), [rectId, circleId]);
    await page.waitForSelector('.num-input');

    const xInput = page.locator('.num-input').first();
    expect(await xInput.inputValue()).toBe('');
    expect(await xInput.getAttribute('placeholder')).toBe('혼합');

    const undoCountBefore = await page.evaluate(() => {
      let n = 0; while (window.__store.canUndo()) { window.__store.undo(); n++; }
      while (window.__store.canRedo()) window.__store.redo();
      return n;
    });

    await xInput.click();
    await xInput.fill('150');
    await xInput.press('Enter');

    const vals = await page.evaluate(([a, b]) => {
      const doc = window.__store.get();
      return [doc.layers[a].transform.x.value, doc.layers[b].transform.x.value];
    }, [rectId, circleId]);
    expect(vals[0]).toBe(150);
    expect(vals[1]).toBe(150);

    // 기록 1건 — 한 번 되돌리면 둘 다 복원
    const reverted = await page.evaluate(([a, b]) => {
      window.__store.undo();
      const doc = window.__store.get();
      return [doc.layers[a].transform.x.value, doc.layers[b].transform.x.value];
    }, [rectId, circleId]);
    expect(reverted[0]).not.toBe(150);
    expect(reverted[1]).not.toBe(150);
  });

  // 18. E5 확장 — 스크럽 + 숫자 칸 끌기 100px + 같은 타입 다른 레이어 선택 → 재생성 0회
  test('[18] 패널 재생성 0회 (스크럽·드래그·레이어 전환)', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');
    await page.evaluate((id) => window.__editorState.set({ selection: [id] }), rectId);
    await page.waitForSelector('.inspector-section');

    const muted = await page.evaluate(async ([a, b]) => {
      const scrollEl = document.querySelector('.inspector-scroll');
      let count = 0;
      const obs = new MutationObserver((muts) => {
        for (const m of muts) if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) count++;
      });
      obs.observe(scrollEl, { childList: true });

      const es = window.__editorState;
      const fc = window.__store.get().meta.frameCount ?? 24;
      for (let f = 0; f < fc; f++) { es.set({ f }); await new Promise(r => queueMicrotask(r)); }

      // 같은 타입(도형) 다른 레이어 선택
      es.set({ selection: [b] });
      await new Promise(r => queueMicrotask(r));
      es.set({ selection: [a] });
      await new Promise(r => queueMicrotask(r));

      obs.disconnect();
      return count;
    }, [rectId, circleId]);

    // 숫자 칸 끌기 100px — 별도로 (실제 포인터)
    const label = page.locator('.num-label').first();
    const lb = await label.boundingBox();
    const mutedDrag = await page.evaluate(() => {
      const scrollEl = document.querySelector('.inspector-scroll');
      window.__mutCount = 0;
      window.__obs2 = new MutationObserver((muts) => {
        for (const m of muts) if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) window.__mutCount++;
      });
      window.__obs2.observe(scrollEl, { childList: true });
      return 0;
    });
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width / 2 + 100, lb.y + lb.height / 2, { steps: 10 });
    await page.mouse.up();
    const dragCount = await page.evaluate(() => { window.__obs2.disconnect(); return window.__mutCount; });

    expect(muted).toBe(0);
    expect(dragCount).toBe(0);
  });
});
