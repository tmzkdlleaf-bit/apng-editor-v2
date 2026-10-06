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

  test('[5] 데스크톱 저장: save_with_dialog 에 원시 바이트만, 경로는 JS가 넘기지 않는다', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const calls = [];
      // 가짜 Tauri 환경. core.invoke 를 가로채 인자를 기록한다.
      window.__TAURI__ = {
        core: {
          invoke: (cmd, payload, opts) => {
            calls.push({
              cmd,
              payloadIsU8: payload instanceof Uint8Array,
              payloadBytes: payload instanceof Uint8Array ? Array.from(payload) : null,
              payloadType: typeof payload,
              hasHeaders: !!(opts && opts.headers),
              defaultNameHeader: opts?.headers?.['x-default-name'] ?? null,
              extHeader: opts?.headers?.['x-extension'] ?? null,
            });
            return Promise.resolve('C:/사용자가고른/경로/테스트.png'); // Rust가 정한 경로
          },
        },
      };
      const P = await import('/src/platform/index.js');
      const isD = P.isDesktop();
      const res = await P.saveFile('테스트.png', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
      return { isD, calls, res };
    });
    expect(r.isD).toBe(true);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].cmd).toBe('save_with_dialog');
    expect(r.calls[0].payloadIsU8).toBe(true);        // 숫자 배열이 아니라 원시 바이트
    expect(r.calls[0].payloadBytes).toEqual([1, 2, 3]);
    expect(r.calls[0].hasHeaders).toBe(true);
    expect(r.calls[0].extHeader).toBe('png');
    // 이름은 ASCII 화(encodeURIComponent)되어 전달 — 한글을 헤더에 그대로 넣지 않는다.
    expect(r.calls[0].defaultNameHeader).toBe(encodeURIComponent('테스트.png'));
    // 경로는 Rust 대화상자가 정한다. JS 가 넘긴 인자 어디에도 저장 경로 문자열이 없다.
    expect(r.res.saved).toBe(true);
    expect(r.res.path).toBe('C:/사용자가고른/경로/테스트.png');
  });

  test('[6] 데스크톱 열기: open_project_with_dialog 호출, JS가 열 파일 경로를 지정하지 않는다', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const calls = [];
      window.__TAURI__ = {
        core: {
          invoke: (cmd, args) => {
            calls.push({ cmd, argKeys: args ? Object.keys(args) : [] });
            return Promise.resolve({ path: 'D:/문서/작업.apngproj', text: '{"ok":true}' });
          },
        },
      };
      const P = await import('/src/platform/index.js');
      const res = await P.openProjectFile();
      return { calls, res };
    });
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].cmd).toBe('open_project_with_dialog');
    // 인자는 마지막 폴더 힌트(dir)뿐 — 열 파일 경로를 JS 가 지정하지 않는다.
    expect(r.calls[0].argKeys).toEqual(['dir']);
    expect(r.res.path).toBe('D:/문서/작업.apngproj');
    expect(r.res.text).toBe('{"ok":true}');
  });
});
