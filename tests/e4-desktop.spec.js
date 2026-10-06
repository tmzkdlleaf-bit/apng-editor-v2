// E4 — 데스크톱(Tauri) 경계의 웹측 동작 + 자동 업데이트 배너 UI.
// Rust/Tauri 빌드 없이 브라우저에서 검증 가능한 부분만 본다.
// (실제 데스크톱 파일 저장·열기·업데이트는 Tauri 런타임이 있어야 하며 여기서 검증하지 않는다.)
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
}

test.describe('E4 — 데스크톱 경계', () => {
  test('[1] 웹에서는 isDesktop()=false, saveFile 은 다운로드 경로', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const P = await import('/src/platform/index.js');
      const isD = P.isDesktop();
      let created = 0, clicked = 0;
      const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = () => { created++; return 'blob:fake'; };
      URL.revokeObjectURL = () => {};
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { clicked++; };
      const res = await P.saveFile('테스트.png', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
      URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
      return { isD, created, clicked, res };
    });
    expect(r.isD).toBe(false);
    expect(r.created).toBe(1);
    expect(r.clicked).toBe(1);
    expect(r.res.saved).toBe(true);
    expect(r.res.path).toBe(null);
  });

  test('[2] openProjectFile·checkUpdate 는 웹에서 null', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const P = await import('/src/platform/index.js');
      return { open: await P.openProjectFile(), upd: await P.checkUpdate() };
    });
    expect(r.open).toBe(null);
    expect(r.upd).toBe(null);
  });

  test('[3] 업데이트 배너: 버튼·다이얼로그·설치 전에 flush 가 먼저', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const { mountUpdateBanner } = await import('/src/ui/update-banner.js');
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      const order = [];
      const update = {
        version: '1.2.3',
        notes: '버그 수정 및 성능 개선',
        // 실제 platform.checkUpdate 의 installAndRestart 와 같은 계약: flush 를 먼저 기다린다.
        installAndRestart: async (flush) => { if (flush) await flush(); order.push('install'); },
      };
      const btn = mountUpdateBanner(mount, update, { flush: async () => { order.push('flush'); } });
      const label = btn.textContent;
      btn.click(); // 다이얼로그 열기
      const notes = document.querySelector('.update-dialog .ud-notes').textContent;
      document.querySelector('.ud-install').click();
      await new Promise((res) => setTimeout(res, 50));
      const installing = document.querySelector('.ud-install')?.textContent ?? '';
      return { label, notes, order, installing };
    });
    expect(r.label).toContain('1.2.3');
    expect(r.notes).toContain('버그 수정');
    expect(r.order).toEqual(['flush', 'install']); // 설치 전에 자동저장 flush
    expect(r.installing).toContain('설치 중');
  });

  test('[4] startUpdateCheck: 주입한 check 로 배너 mount, cancel 은 막는다', async ({ page }) => {
    await openApp(page);
    const mounted = await page.evaluate(async () => {
      const { startUpdateCheck } = await import('/src/ui/update-banner.js');
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      const update = { version: '9.9.9', notes: '', installAndRestart: async () => {} };
      startUpdateCheck(mount, { delayMs: 10, check: async () => update });
      await new Promise((res) => setTimeout(res, 90));
      return mount.querySelector('.update-badge')?.textContent ?? null;
    });
    expect(mounted).toContain('9.9.9');

    const afterCancel = await page.evaluate(async () => {
      const { startUpdateCheck } = await import('/src/ui/update-banner.js');
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      const cancel = startUpdateCheck(mount, {
        delayMs: 60, check: async () => ({ version: 'x', notes: '', installAndRestart: async () => {} }),
      });
      cancel(); // 확인 전에 취소
      await new Promise((res) => setTimeout(res, 130));
      return mount.querySelector('.update-badge');
    });
    expect(afterCancel).toBe(null);
  });
});
