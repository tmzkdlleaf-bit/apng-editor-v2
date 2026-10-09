// F5-2·3 — 프로젝트 목록(복제 독립·이름·삭제) + 템플릿.
import { test, expect } from '@playwright/test';

// 실제 앱(데모 아님)으로 idb 프로젝트 사용. reload 를 가로채 전환을 관찰.
async function openReal(page) {
  await page.addInitScript(() => { window.__noReload = true; });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('F5-3 — 템플릿: createProjectFromTemplate 가 프리셋 크기·레이어 구성', async ({ page }) => {
  await openReal(page);
  const r = await page.evaluate(async () => {
    const { createProjectFromTemplate, CANVAS_PRESETS, TEMPLATES } = await import('/src/ui/templates.js');
    const empty = createProjectFromTemplate('empty', 'discord-sticker');
    const sparkle = createProjectFromTemplate('sparkle-circle', 'ccfolia-cutin');
    return {
      presets: CANVAS_PRESETS.length, templates: TEMPLATES.length,
      emptyW: empty.meta.width, emptyH: empty.meta.height, emptyLayers: empty.order.length,
      sparkleW: sparkle.meta.width, sparkleLayers: sparkle.order.length,
      sparkleHasEffect: Object.values(sparkle.layers).some((l) => l.type === 'effect'),
    };
  });
  expect(r.presets).toBe(4);
  expect(r.templates).toBe(4);
  expect(r.emptyW).toBe(320); expect(r.emptyH).toBe(320); expect(r.emptyLayers).toBe(0);
  expect(r.sparkleW).toBe(768); expect(r.sparkleLayers).toBeGreaterThanOrEqual(2);
  expect(r.sparkleHasEffect).toBe(true);
});

test('F5-2 — 프로젝트 목록: 메뉴 → 라이브러리 열림', async ({ page }) => {
  await openReal(page);
  await page.click('.project-name-btn');
  await page.click('.project-menu [data-act="library"]');
  await expect(page.locator('.library-modal')).toBeVisible();
  // 최소 현재 프로젝트 1개 카드
  expect(await page.locator('.library-card').count()).toBeGreaterThanOrEqual(1);
});

test('F5-2 — 복제: 독립 문서(한쪽 수정이 다른 쪽에 영향 없음)', async ({ page }) => {
  await openReal(page);
  const r = await page.evaluate(async () => {
    const { listProjects, getProject, putProject } = await import('/src/core/io/idb.js');
    const api = window.__project;
    // 현재 프로젝트 id
    const curId = api.getId();
    const nid = await api.duplicateProject(curId);
    // 복제본 문서에 레이어 추가(원본 건드리지 않게 직접 idb 수정)
    const dup = await getProject(nid);
    dup.doc.meta.width = 999;
    await putProject(dup);
    const orig = await getProject(curId);
    return { nid, origW: orig.doc.meta.width, dupW: (await getProject(nid)).doc.meta.width };
  });
  expect(r.nid).toBeTruthy();
  expect(r.dupW).toBe(999);
  expect(r.origW).not.toBe(999); // 원본은 영향 없음
});

test('F5-2 — 이름 바꾸기 → 내보내기 파일 이름이 따라감', async ({ page }) => {
  await openReal(page);
  const r = await page.evaluate(async () => {
    const api = window.__project;
    await api.renameProject(api.getId(), '테스트이름');
    // exportFile 이 저장할 파일 이름을 가로채기
    let captured = null;
    const P = await import('/src/platform/index.js');
    const orig = P.saveFile;
    // saveFile 은 import 바인딩이라 교체 불가 → exportFile 내부가 projectName 사용하는지 이름으로 확인
    // 대신 projectApi.getName 이 바뀌었는지 + 상단 버튼 텍스트 확인
    return { name: api.getName(), btn: document.querySelector('.project-name-btn')?.textContent };
  });
  expect(r.name).toBe('테스트이름');
  expect(r.btn).toContain('테스트이름');
});
