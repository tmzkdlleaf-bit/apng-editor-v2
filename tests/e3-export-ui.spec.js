// E3 — 내보내기 화면(모달 UI).
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__exportUI));
  await page.waitForTimeout(200);
}
async function openModal(page) {
  await page.keyboard.press('Control+e');
  await expect(page.locator('.export-modal')).toBeVisible();
}
// 설정 변경 후 예상(미리보기) 결과가 생길 때까지 대기
async function waitEstimate(page) {
  await page.waitForFunction(() => !!window.__exportUI.getLastResult(), null, { timeout: 20000 });
}
async function pickPreset(page, id) {
  await page.selectOption('.ex-settings [data-k="presetId"]', id);
}

test.describe('E3 — 내보내기 화면', () => {
  test('[1] Ctrl+E로 열고 Esc로 닫는다', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.export-modal')).toBeHidden();
  });

  test('[2] 디스코드 스티커 → APNG·형식별 칸·내보내기 파일명/MIME/≤512KB', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'discord-sticker');
    // 형식 APNG, 색상 수 칸 보임
    expect(await page.evaluate(() => window.__exportUI.getState().format)).toBe('apng');
    await expect(page.locator('.ex-settings [data-k="colors"]')).toBeVisible();
    // GIF로 바꾸면 색상 수 대신 고정 안내
    await page.check('.ex-settings input[name="ex-format"][value="gif"]');
    await expect(page.locator('.ex-settings [data-k="colors"]')).toHaveCount(0);
    await expect(page.locator('.ex-note')).toContainText('256색 고정');
    // 다시 APNG
    await page.check('.ex-settings input[name="ex-format"][value="apng"]');
    await expect(page.locator('.ex-settings [data-k="colors"]')).toBeVisible();

    await waitEstimate(page);
    await page.click('#ex-run');
    await page.waitForFunction(() => !!window.__lastExport, null, { timeout: 30000 });
    const r = await page.evaluate(() => window.__lastExport);
    expect(r.filename).toMatch(/\.png$/);
    expect(r.mime).toBe('image/png');
    expect(r.bytes).toBeLessThanOrEqual(512_000);
  });

  test('[3] 값 수정 → (수정됨) 표시', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'ccfolia-apng');
    expect(await page.evaluate(() => window.__exportUI.getState().modified)).toBe(false);
    await page.selectOption('.ex-settings [data-k="scaleMul"]', '0.5');
    await expect(page.locator('.ex-modified')).toBeVisible();
    expect(await page.evaluate(() => window.__exportUI.getState().modified)).toBe(true);
  });

  test('[4] 목표에 맞추기 → 목표 안, 설정 칸이 고른 값으로', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'ccfolia-apng'); // 1MB 목표. 768 무손실>1MB → 256색 선택됨
    await page.click('#ex-fit');
    await page.waitForFunction(() => {
      const r = window.__exportUI.getLastResult();
      return r && document.querySelector('#ex-step')?.textContent?.includes('완료');
    }, null, { timeout: 40000 });
    const r = await page.evaluate(() => ({ res: window.__exportUI.getLastResult(), st: window.__exportUI.getState() }));
    expect(r.res.bytes).toBeLessThanOrEqual(1_000_000);
    expect(r.st.colors).toBe(256);      // 고른 값으로 칸이 바뀜
    // 색상 수 select도 256을 가리킴
    expect(await page.inputValue('.ex-settings [data-k="colors"]')).toBe('256');
  });

  test('[5] 함께 만들기 2개 → 결과 2줄, 각 저장 동작', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'ccfolia-apng');
    // 함께 만들기에서 ccfolia-webp 체크
    await page.check('.ex-together-ctl[value="ccfolia-webp"]');
    await expect(page.locator('#ex-run')).toHaveText('2개 내보내기');
    await page.click('#ex-run');
    await page.waitForFunction(() => document.querySelectorAll('.ex-result-row').length === 2, null, { timeout: 60000 });
    const rows = page.locator('.ex-result-row');
    await expect(rows).toHaveCount(2);
    // 첫 줄 저장 클릭 → __lastExport 설정
    await rows.first().locator('.ex-result-save').click();
    const saved = await page.evaluate(() => window.__lastExport);
    expect(saved.bytes).toBeGreaterThan(0);
    expect(saved.filename).toMatch(/\.(png|webp)$/);
  });

  test('[6] 굽기 중 취소 → 1초 안에 멈춤, 다운로드 없음', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'archive'); // 768 무손실 — 굽기+인코딩 오래 걸림
    await waitEstimate(page);
    await page.evaluate(() => { window.__lastExport = null; });
    await page.click('#ex-run');
    await page.waitForTimeout(80);
    await page.click('#ex-cancel');
    await expect.poll(() => page.evaluate(() => document.querySelector('#ex-step')?.textContent), { timeout: 2000 })
      .toContain('취소');
    const lastExport = await page.evaluate(() => window.__lastExport);
    expect(lastExport).toBeNull();
  });

  test('[7] 미리보기 img 원본 바이트 == 결과 Blob 바이트', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'discord-emoji'); // 작고 빠름
    await waitEstimate(page);
    const r = await page.evaluate(async () => {
      const src = document.querySelector('.ex-preview').src;
      const blob = await (await fetch(src)).blob();
      return { imgBytes: blob.size, resBytes: window.__exportUI.getLastResult().bytes };
    });
    expect(r.imgBytes).toBe(r.resBytes);
  });

  test('[8] 창 다시 열기 → 설정 유지', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await pickPreset(page, 'discord-emoji');
    await page.selectOption('.ex-settings [data-k="scaleMul"]', '0.5');
    await page.keyboard.press('Escape');
    await expect(page.locator('.export-modal')).toBeHidden();
    await openModal(page);
    const st = await page.evaluate(() => window.__exportUI.getState());
    expect(st.presetId).toBe('discord-emoji');
    expect(st.scaleMul).toBe(0.5);
  });
});
