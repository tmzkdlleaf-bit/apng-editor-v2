// F2-5 — 컴포넌트·인스턴스 + F2-8 행 메뉴 일부.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}
// 도형 둘을 묶어 그룹을 만들고 그 id 를 돌려준다.
async function makeGroup(page) {
  return page.evaluate(() => {
    const before = new Set(Object.keys(window.__store.get().layers));
    const doc = window.__store.get();
    const shapes = doc.order.filter((x) => doc.layers[x]?.type === 'shape').slice(0, 2);
    window.__store.apply({ type: 'group', ids: shapes });
    const after = window.__store.get().layers;
    return Object.keys(after).find((id) => !before.has(id) && after[id].type === 'group');
  });
}

test('F2-5 — 인스턴스: 마스터 자식 바꾸면 반영, override 유지', async ({ page }) => {
  await openApp(page);
  const gid = await makeGroup(page);
  expect(gid).toBeTruthy();

  const r = await page.evaluate(async (groupId) => {
    const C = await import('/src/ui/component-ops.js');
    C.makeComponent(window.__store, window.__editorState); // 선택이 그룹이어야 함
    window.__editorState.set({ selection: [groupId] });
    C.makeComponent(window.__store, window.__editorState);
    const instId = C.addInstance(window.__store, window.__editorState, groupId);

    // 인스턴스의 첫 자식에 override(opacity 0.3)
    const master = window.__store.get().layers[groupId];
    const childId = master.childOrder[0];
    window.__store.apply({ type: 'setLayer', id: instId, patch: { overrides: { [childId]: { opacity: 0.3 } } } });

    // 마스터 자식의 색을 바꾼다
    const childBefore = window.__store.get().layers[childId].shape?.fill;
    window.__store.apply({ type: 'setLayer', id: childId, patch: { shape: { ...window.__store.get().layers[childId].shape, fill: '#abcdef' } } });

    const inst = window.__store.get().layers[instId];
    return {
      isComponent: window.__store.get().layers[groupId].isComponent,
      masterId: inst.masterId,
      overrideKept: inst.overrides?.[childId]?.opacity,
      childFill: window.__store.get().layers[childId].shape?.fill,
      childBefore,
    };
  }, gid);

  expect(r.isComponent).toBe(true);
  expect(r.masterId).toBe(gid);
  expect(r.overrideKept).toBe(0.3);        // override 유지
  expect(r.childFill).toBe('#abcdef');      // 마스터 자식 변경 → 인스턴스도 이 자식을 참조해 반영
  expect(r.childFill).not.toBe(r.childBefore);
});

test('F2-5 — 순환 방지: 인스턴스를 자기 마스터 안에 못 넣는다', async ({ page }) => {
  await openApp(page);
  const gid = await makeGroup(page);
  const ok = await page.evaluate(async (groupId) => {
    const C = await import('/src/ui/component-ops.js');
    const doc = window.__store.get();
    // canPlaceInstance: 마스터 그룹 안(groupId)으로 넣으면 false
    const intoMaster = C.canPlaceInstance(doc, groupId, groupId);
    const intoTop = C.canPlaceInstance(doc, groupId, null);
    return { intoMaster, intoTop };
  }, gid);
  expect(ok.intoMaster).toBe(false); // 자기 마스터 안 → 순환, 막힘
  expect(ok.intoTop).toBe(true);     // 최상위 → 허용
});

test('F2-8 — 행 우클릭 메뉴: 복제 동작', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => window.__store.get().order.length);
  // 첫 레이어 행 우클릭
  const row = page.locator('.timeline-layers .tl-row[data-kind="layer"]').first();
  await row.click({ button: 'right' });
  await expect(page.locator('.row-menu')).toBeVisible();
  await page.locator('.row-menu-item', { hasText: '복제' }).click();
  const after = await page.evaluate(() => window.__store.get().order.length);
  expect(after).toBeGreaterThan(before);
});
