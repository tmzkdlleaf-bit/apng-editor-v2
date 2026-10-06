// 자동 업데이트 UI — 상단 바에 "새 버전 x.y.z" 버튼을 띄우고, 누르면 릴리스 노트 + 설치/나중에.
// check(확인)와 flush(설치 전 자동저장)는 주입받는다(테스트·웹/데스크톱 분리).
import { checkUpdate as defaultCheck } from '../platform/index.js';

// 업데이트가 있으면 버튼을 mount 하고, 누르면 안내 다이얼로그를 띄운다. 반환: 버튼 엘리먼트 또는 null.
export function mountUpdateBanner(mountEl, update, { flush = null } = {}) {
  if (!mountEl || !update) return null;

  const btn = document.createElement('button');
  btn.className = 'update-badge';
  btn.dataset.action = 'update';
  btn.textContent = `새 버전 ${update.version}`;
  btn.title = '업데이트가 있습니다';
  mountEl.appendChild(btn);

  btn.addEventListener('click', () => openDialog());

  function openDialog() {
    if (document.querySelector('.update-dialog')) return;
    const dlg = document.createElement('div');
    dlg.className = 'update-dialog';
    dlg.innerHTML = `
      <div class="ud-panel" role="dialog" aria-label="업데이트">
        <div class="ud-title">새 버전 ${update.version}</div>
        <pre class="ud-notes">${(update.notes || '변경 내용이 제공되지 않았습니다.').replace(/</g, '&lt;')}</pre>
        <div class="ud-btns">
          <button class="ud-later">나중에</button>
          <button class="ud-install accent">지금 설치하고 다시 시작</button>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    const close = () => dlg.remove();
    dlg.querySelector('.ud-later').addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.querySelector('.ud-install').addEventListener('click', async () => {
      const installBtn = dlg.querySelector('.ud-install');
      installBtn.disabled = true;
      installBtn.textContent = '설치 중…';
      try {
        // 설치 전 자동 저장 flush 를 기다린 뒤 설치·재시작.
        await update.installAndRestart(flush);
      } catch (err) {
        installBtn.disabled = false;
        installBtn.textContent = '지금 설치하고 다시 시작';
        const msg = dlg.querySelector('.ud-err') || document.createElement('div');
        msg.className = 'ud-err';
        msg.textContent = '설치에 실패했습니다: ' + (err?.message ?? err);
        dlg.querySelector('.ud-panel').appendChild(msg);
      }
    });
  }

  return btn;
}

// 시작 delayMs 뒤 한 번 확인. 있으면 배너를 mount. 실패/없음은 조용히 넘어간다.
// check·flush 주입 가능(테스트). 반환: 타이머를 멈추는 cancel 함수.
export function startUpdateCheck(mountEl, { flush = null, delayMs = 10000, check = defaultCheck } = {}) {
  const timer = setTimeout(async () => {
    let update = null;
    try { update = await check(); } catch { update = null; }
    if (update) mountUpdateBanner(mountEl, update, { flush });
  }, delayMs);
  return () => clearTimeout(timer);
}
