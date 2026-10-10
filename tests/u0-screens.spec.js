// 화면 검수용 스크린샷(다크·라이트) → docs/screens/. 단언 최소, 파일 생성이 목적.
// item 13: 빈 선택·이미지·글자(끝까지 스크롤)·이펙트·드롭다운·추가 메뉴·모션 갤러리·이펙트 갤러리·
//   내보내기(결과 후)·프로젝트 목록·단축키 안내·레이어 행 호버·타임라인 키·클립.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'docs', 'screens');

test.use({ viewport: { width: 1400, height: 900 } });

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    try { localStorage.setItem('apng2.theme', t); } catch {}
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(80);
}
function layerOfType(page, type) {
  return page.evaluate((t) => {
    const doc = window.__store.get();
    return Object.keys(doc.layers).find((id) => doc.layers[id]?.type === t) ?? null;
  }, type);
}
async function select(page, id) {
  await page.evaluate((i) => window.__editorState.set({ selection: i ? [i] : [], cameraActive: false }), id);
  await page.waitForTimeout(120);
}

for (const theme of ['dark', 'light']) {
  test(`화면 검수 스크린샷 — ${theme}`, async ({ page }) => {
    const shot = (name) => page.screenshot({ path: join(OUT, `${theme}-${name}.png`) });

    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage && window.__exportUI), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await setTheme(page, theme);

    // 01 빈 선택
    await select(page, null);
    await shot('01-empty');

    // 02 이미지 선택
    const imgId = await layerOfType(page, 'image');
    if (imgId) { await select(page, imgId); await shot('02-image'); }

    // 03 글자 선택 — 속성 패널 끝까지 스크롤
    const textId = await layerOfType(page, 'text');
    if (textId) {
      await select(page, textId);
      await page.evaluate(() => {
        for (const h of document.querySelectorAll('[data-region="inspector"] .inspector-section.collapsed .inspector-section-header')) h.click();
        const sc = document.querySelector('.inspector-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
      });
      await page.waitForTimeout(120);
      await shot('03-text');
    }

    // 04 이펙트 선택
    const fxId = await layerOfType(page, 'effect');
    if (fxId) { await select(page, fxId); await shot('04-effect'); }

    // 05 블렌드 드롭다운 열림
    await select(page, imgId || (await page.evaluate(() => window.__store.get().order[0])));
    const blend = page.locator('.inspector-section .dropdown').first();
    if (await blend.count()) {
      await blend.scrollIntoViewIfNeeded();
      await blend.click();
      await page.waitForTimeout(120);
      await shot('05-dropdown');
      await page.keyboard.press('Escape');
    }

    // 06 레이어 추가 메뉴
    await page.click('.tl-layers-head .tl-add-btn');
    await page.waitForTimeout(120);
    await shot('06-addmenu');

    // 07 이펙트 갤러리(큰 창) — 추가 메뉴에서 이펙트
    const fxItem = page.locator('.layer-add-item[data-kind="effect"]');
    if (await fxItem.count()) {
      await fxItem.click();
      await page.waitForSelector('.gallery-panel', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      await shot('07-effect-gallery');
      await page.keyboard.press('Escape');
    } else { await page.keyboard.press('Escape'); }

    // 08 모션 갤러리(큰 창) — 레이어 선택 후 움직임 섹션에서 모션 추가
    await select(page, imgId || (await page.evaluate(() => window.__store.get().order[0])));
    const addMotion = page.getByText('+ 모션 추가').first();
    if (await addMotion.count()) {
      await addMotion.scrollIntoViewIfNeeded();
      await addMotion.click();
      await page.waitForSelector('.gallery-panel', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      await shot('08-motion-gallery');
      await page.keyboard.press('Escape');
    }

    // 09 레이어 행에 마우스 올린 상태(눈·잠금 아이콘 확인)
    const firstRow = page.locator('.tl-row[data-kind="layer"]').first();
    if (await firstRow.count()) { await firstRow.hover(); await page.waitForTimeout(80); await shot('09-row-hover'); }

    // 10 타임라인 키·클립이 있는 상태 — 타임라인 맨 위(보이는) 행에 넣어 화면에 나오게.
    const keyId = await page.evaluate(() => document.querySelector('.tl-row[data-kind="layer"]')?.dataset.id
      ?? window.__store.get().order[window.__store.get().order.length - 1]);
    await page.evaluate(async (id) => {
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 0 });
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 300, f: 12 });
      try {
        const { createClip } = await import('/src/core/doc/schema.js');
        const { getMotion } = await import('/src/motions/registry.js');
        const clip = createClip(getMotion('test-float'), { start: 4 });
        window.__store.apply({ type: 'addClip', id, clip });
      } catch {}
    }, keyId);
    await select(page, keyId);
    await page.waitForTimeout(150);
    await shot('10-timeline-keys');

    // 11 내보내기 창(결과·미리보기 나온 뒤)
    await page.keyboard.press('Control+e');
    await expect(page.locator('.export-modal')).toBeVisible();
    // 미리보기 이미지가 뜰 때까지(인코딩 완료) 최대 8초 대기
    await page.waitForFunction(() => {
      const img = document.querySelector('.export-modal img');
      return img && img.getAttribute('src') && img.getAttribute('src').startsWith('blob:');
    }, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    await shot('11-export');
    await page.keyboard.press('Escape');

    // 12 단축키 안내 — 상단바 도움말 버튼
    const helpBtn = page.locator('[data-action="help"]');
    if (await helpBtn.count()) {
      await helpBtn.click();
      await page.waitForSelector('.help-modal', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(150);
      await shot('12-shortcuts');
      await page.keyboard.press('Escape');
    }

    // 13 프로젝트 목록 — 일반 모드로 전환해 라이브러리 열기(데모에는 저장 프로젝트가 없음)
    await page.evaluate(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} }); // 온보딩 말풍선 안 뜨게
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__stage), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const projBtn = page.locator('.project-name-btn');
    if (await projBtn.count()) {
      await projBtn.click();
      const lib = page.locator('[data-act="library"]');
      if (await lib.count()) {
        await lib.click();
        await page.waitForTimeout(300);
      }
      await shot('13-projects');
    }
  });
}
