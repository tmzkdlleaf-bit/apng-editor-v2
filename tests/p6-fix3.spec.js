// P6 보완3 테스트 — 그룹 계층 / 끌어 놓기 / 만들기·풀기 (C2, G1~G3)
import { test, expect } from '@playwright/test';

test.describe('P6 보완3 — 그룹 계층 / 끌어 놓기 / 만들기·풀기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
  });

  async function layerIdByName(page, name) {
    return page.evaluate((n) => {
      const doc = window.__store.get();
      for (const id of Object.keys(doc.layers)) if (doc.layers[id].name === n) return id;
      return null;
    }, name);
  }

  // G1: computeRows 가 그룹 계층을 depth 와 함께 평탄화한다
  test('[G1] computeRows — 그룹 펼침 시 자식 행이 들여쓰기 depth 로 나온다', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { computeRows } = await import('/src/ui/timeline/rows.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc();
      const g = createLayer('group', { name: '그룹', childOrder: [] });
      const a = createLayer('shape', { name: 'A' });
      const b = createLayer('shape', { name: 'B' });
      doc.layers[g.id] = g; doc.layers[a.id] = a; doc.layers[b.id] = b;
      doc.order.push(g.id, b.id);          // 최상위: 그룹 + B
      g.childOrder.push(a.id); a.parentId = g.id; // 그룹 안: A

      const collapsed = computeRows(doc, {});
      const expanded  = computeRows(doc, { [g.id]: true });
      const groupRow  = expanded.find(r => r.kind === 'layer' && r.id === g.id);
      const childRow  = expanded.find(r => r.kind === 'layer' && r.id === a.id);
      return {
        collapsedIds: collapsed.filter(r => r.kind === 'layer').map(r => r.id),
        expandedIds:  expanded.filter(r => r.kind === 'layer').map(r => r.id),
        groupDepth: groupRow?.depth, groupExpandable: groupRow?.hasExpandable,
        childDepth: childRow?.depth, gid: g.id, aid: a.id, bid: b.id,
      };
    });
    // 접힘: 자식 A 안 보임
    expect(result.collapsedIds).not.toContain(result.aid);
    // 펼침: 자식 A 보임, depth = 그룹 depth + 1
    expect(result.expandedIds).toContain(result.aid);
    expect(result.groupDepth).toBe(0);
    expect(result.childDepth).toBe(1);
    expect(result.groupExpandable).toBe(true);
  });

  // G2: 자기 자손 안으로의 드롭 판정을 막는다
  test('[G2] isSelfOrDescendant — 그룹을 자기 자손으로 못 넣는다', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { isSelfOrDescendant } = await import('/src/ui/timeline/rows.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc();
      const outer = createLayer('group', { name: '바깥', childOrder: [] });
      const inner = createLayer('group', { name: '안', childOrder: [] });
      doc.layers[outer.id] = outer; doc.layers[inner.id] = inner;
      outer.childOrder.push(inner.id); inner.parentId = outer.id;
      return {
        selfInto:  isSelfOrDescendant(doc, outer.id, outer.id),
        descInto:  isSelfOrDescendant(doc, outer.id, inner.id),
        unrelated: isSelfOrDescendant(doc, inner.id, outer.id),
      };
    });
    expect(r.selfInto).toBe(true);
    expect(r.descInto).toBe(true);
    expect(r.unrelated).toBe(false);
  });

  // G3: Ctrl+G 로 선택 레이어를 묶는다 (한 기록), Ctrl+Shift+G 로 푼다
  test('[G3] Ctrl+G 그룹 → 자식 parentId, Ctrl+Shift+G 풀기', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');
    await page.evaluate(([a, b]) => window.__editorState.set({ selection: [a, b] }), [rectId, circleId]);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+g');

    const grouped = await page.evaluate(([a, b]) => {
      const doc = window.__store.get();
      const sel = window.__editorState.get().selection;
      const gid = sel[0];
      const g   = doc.layers[gid];
      return {
        selLen: sel.length,
        isGroup: g?.type === 'group',
        childHasA: (g?.childOrder ?? []).includes(a),
        childHasB: (g?.childOrder ?? []).includes(b),
        aParent: doc.layers[a].parentId,
        aInTop: doc.order.includes(a),
        gid,
      };
    }, [rectId, circleId]);
    expect(grouped.selLen).toBe(1);
    expect(grouped.isGroup).toBe(true);
    expect(grouped.childHasA).toBe(true);
    expect(grouped.childHasB).toBe(true);
    expect(grouped.aParent).toBe(grouped.gid);
    expect(grouped.aInTop).toBe(false);

    // 한 번 되돌리면 그룹 생성 전으로
    const afterUndo = await page.evaluate(([a, gid]) => {
      window.__store.undo();
      const doc = window.__store.get();
      return { aParent: doc.layers[a].parentId, groupGone: !doc.layers[gid], aInTop: doc.order.includes(a) };
    }, [rectId, grouped.gid]);
    expect(afterUndo.aParent).toBe(null);
    expect(afterUndo.groupGone).toBe(true);
    expect(afterUndo.aInTop).toBe(true);

    // 다시 묶고 → 풀기
    await page.evaluate(() => window.__store.redo());
    await page.evaluate((gid) => window.__editorState.set({ selection: [gid] }), grouped.gid);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+Shift+g');

    const ungrouped = await page.evaluate(([a, b, gid]) => {
      const doc = window.__store.get();
      return {
        groupGone: !doc.layers[gid],
        aTop: doc.order.includes(a),
        bTop: doc.order.includes(b),
        aParent: doc.layers[a].parentId,
      };
    }, [rectId, circleId, grouped.gid]);
    expect(ungrouped.groupGone).toBe(true);
    expect(ungrouped.aTop).toBe(true);
    expect(ungrouped.bTop).toBe(true);
    expect(ungrouped.aParent).toBe(null);
  });

  // 추가 메뉴 "그룹": 선택 없으면 빈 그룹 1개 추가
  test('[메뉴] 그룹 항목 — 선택 없음 → 빈 그룹 추가', async ({ page }) => {
    await page.evaluate(() => window.__editorState.set({ selection: [] }));
    const before = await page.evaluate(() => window.__store.get().order.length);

    await page.locator('.tl-add-btn').click();
    await page.locator('.layer-add-item', { hasText: '그룹' }).click();

    const r = await page.evaluate(() => {
      const doc = window.__store.get();
      const sel = window.__editorState.get().selection;
      const g   = doc.layers[sel[0]];
      return { count: doc.order.length, isGroup: g?.type === 'group', empty: (g?.childOrder ?? []).length === 0 };
    });
    expect(r.count).toBe(before + 1);
    expect(r.isGroup).toBe(true);
    expect(r.empty).toBe(true);
  });

  // 타임라인 UI: 그룹 펼침 → 자식 행이 목록에 들여써져 나타난다
  test('[UI] 그룹 펼치면 자식 행이 들여쓰기되어 보인다', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');
    await page.evaluate(([a, b]) => window.__editorState.set({ selection: [a, b] }), [rectId, circleId]);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+g');

    const gid = await page.evaluate(() => window.__editorState.get().selection[0]);

    // 그룹은 생성 직후 펼쳐진 상태 → 자식 행(사각형)이 보이고 더 들여써진다
    const groupRow = page.locator(`.tl-row[data-id="${gid}"]`);
    const childRow = page.locator(`.tl-row[data-id="${rectId}"]`);
    await expect(childRow).toBeVisible();
    const groupPad = await groupRow.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
    const childPad = await childRow.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
    expect(childPad).toBeGreaterThan(groupPad);

    // 펼침 버튼으로 접으면 자식 행이 사라진다
    await groupRow.locator('.tl-expand').click();
    await expect(childRow).toHaveCount(0);
  });

  // ── G4: 실제 마우스 끌기 (행 이름 영역을 잡는다) ──────────────────────────
  // 행 이름(.tl-name)을 잡아 대상 행의 세로 비율 지점으로 끈다
  async function dragRowOnto(page, srcId, dstId, yFrac = 0.5) {
    const srcBox = await page.locator(`.tl-row[data-id="${srcId}"] .tl-name`).boundingBox();
    const dstBox = await page.locator(`.tl-row[data-id="${dstId}"]`).boundingBox();
    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    // 임계(5px) 넘기며 대상 세로 지점으로
    await page.mouse.move(dstBox.x + dstBox.width / 2, dstBox.y + dstBox.height * yFrac, { steps: 10 });
    await page.mouse.up();
  }

  async function groupViaKey(page, ids) {
    await page.evaluate((s) => window.__editorState.set({ selection: s }), ids);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+g');
    return page.evaluate(() => window.__editorState.get().selection[0]);
  }

  // G4-A: 자식을 그룹 밖 최상위로 끌어내기 → parentId null
  test('[G4-A] 마우스: 자식을 최상위 행 위로 끌어내면 parentId null', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');
    const textId   = await layerIdByName(page, '텍스트');

    await groupViaKey(page, [rectId, circleId]); // 그룹(사각형, 원), 펼쳐짐

    // 자식 사각형이 보이는지 확인 후, 최상위 텍스트 행(그룹 아님) 위로 끈다
    await expect(page.locator(`.tl-row[data-id="${rectId}"]`)).toBeVisible();
    await dragRowOnto(page, rectId, textId, 0.2);

    const r = await page.evaluate((a) => {
      const doc = window.__store.get();
      return { parent: doc.layers[a].parentId, inTop: doc.order.includes(a) };
    }, rectId);
    expect(r.parent).toBe(null);
    expect(r.inTop).toBe(true);
  });

  // G4-B: 그룹을 자기 자손 그룹 위에 놓기 → 변화 없음
  test('[G4-B] 마우스: 그룹을 자기 자손 그룹 위에 놓으면 변화 없음', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');

    // 안쪽 그룹(원) → 바깥 그룹(사각형 + 안쪽)
    const innerId = await groupViaKey(page, [circleId]);
    const outerId = await groupViaKey(page, [rectId, innerId]);
    // 안쪽 그룹 행이 보이도록 펼침 보장
    await page.evaluate((ids) => {
      const es = window.__editorState.get();
      window.__editorState.set({ expanded: { ...es.expanded, [ids[0]]: true, [ids[1]]: true } });
    }, [outerId, innerId]);
    await expect(page.locator(`.tl-row[data-id="${innerId}"]`)).toBeVisible();

    const before = await page.evaluate((o) => {
      const doc = window.__store.get();
      return { order: [...doc.order], outerParent: doc.layers[o].parentId, canUndo: window.__store.canUndo() };
    }, outerId);

    // 바깥 그룹을 자기 자손(안쪽 그룹) 가운데로 끈다 → 막혀야 함
    await dragRowOnto(page, outerId, innerId, 0.5);

    const after = await page.evaluate(([o, i]) => {
      const doc = window.__store.get();
      return {
        order: [...doc.order],
        outerParent: doc.layers[o].parentId,
        innerParent: doc.layers[i].parentId,
      };
    }, [outerId, innerId]);
    expect(after.order).toEqual(before.order);
    expect(after.outerParent).toBe(null);
    expect(after.innerParent).toBe(outerId); // 여전히 바깥 그룹의 자식
  });

  // G4-C: Ctrl+G 후 되돌리기 1번 → 원상태 (선택은 실제 마우스 클릭)
  test('[G4-C] 마우스 선택 → Ctrl+G → 되돌리기 1번 → 원상태', async ({ page }) => {
    const rectId   = await layerIdByName(page, '사각형');
    const circleId = await layerIdByName(page, '원');

    const snap = () => page.evaluate(() => {
      const doc = window.__store.get();
      const layers = {};
      for (const id of Object.keys(doc.layers)) {
        layers[id] = { parentId: doc.layers[id].parentId ?? null, childOrder: doc.layers[id].childOrder ?? null };
      }
      return JSON.stringify({ order: doc.order, layers });
    });

    const before = await snap();

    // 실제 마우스로 두 행 선택 (클릭 + Ctrl+클릭)
    await page.locator(`.tl-row[data-id="${rectId}"] .tl-name`).click();
    await page.locator(`.tl-row[data-id="${circleId}"] .tl-name`).click({ modifiers: ['Control'] });
    expect(await page.evaluate(() => window.__editorState.get().selection.length)).toBe(2);

    await page.keyboard.press('Control+g');
    const grouped = await page.evaluate(([a, b]) => {
      const doc = window.__store.get();
      const gid = window.__editorState.get().selection[0];
      return { gid, aParent: doc.layers[a].parentId, bParent: doc.layers[b].parentId, isGroup: doc.layers[gid]?.type === 'group' };
    }, [rectId, circleId]);
    expect(grouped.isGroup).toBe(true);
    expect(grouped.aParent).toBe(grouped.gid);
    expect(grouped.bParent).toBe(grouped.gid);

    // 되돌리기 1번 → 그룹 생성 전과 완전히 동일
    await page.evaluate(() => window.__store.undo());
    expect(await snap()).toBe(before);
  });
});
