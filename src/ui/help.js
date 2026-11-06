// 도움말(F5-4) — 단축키 안내(SHORTCUTS 단일 소스에서 생성, 검색) + 처음 안내 다시 보기.
import { SHORTCUTS } from './shortcuts.js';

const ONBOARD_KEY = 'apng2.onboarded';
let _help = null;
let _onboard = null;

// ── 단축키/도움말 창 ──────────────────────────────────────────────────────
export function openHelp(onReplayOnboard) {
  closeHelp();
  const modal = document.createElement('div'); modal.className = 'help-modal';
  const panel = document.createElement('div'); panel.className = 'help-panel';
  modal.appendChild(panel);

  const head = document.createElement('div'); head.className = 'help-head';
  head.innerHTML = '<span class="help-title">도움말 · 단축키</span>';
  const closeBtn = document.createElement('button'); closeBtn.className = 'help-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeHelp);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const tools = document.createElement('div'); tools.className = 'help-tools';
  const search = document.createElement('input'); search.className = 'help-search'; search.type = 'text'; search.placeholder = '단축키 검색…';
  const replay = document.createElement('button'); replay.className = 'quiet sm'; replay.textContent = '처음 안내 다시 보기';
  replay.addEventListener('click', () => { closeHelp(); onReplayOnboard?.(); });
  tools.append(search, replay);
  panel.appendChild(tools);

  const listEl = document.createElement('div'); listEl.className = 'help-list';
  panel.appendChild(listEl);

  function _render() {
    const q = search.value.trim().toLowerCase();
    listEl.textContent = '';
    const items = SHORTCUTS.filter((s) => !q || s.label.toLowerCase().includes(q) || s.keys.join('+').toLowerCase().includes(q) || s.cat.toLowerCase().includes(q));
    let curCat = null;
    for (const s of items) {
      if (s.cat !== curCat) { curCat = s.cat; const h = document.createElement('div'); h.className = 'help-cat'; h.textContent = s.cat; listEl.appendChild(h); }
      const row = document.createElement('div'); row.className = 'help-row shortcut-row';
      const keys = document.createElement('span'); keys.className = 'help-keys';
      for (const k of s.keys) { const kb = document.createElement('kbd'); kb.textContent = k; keys.appendChild(kb); }
      const lbl = document.createElement('span'); lbl.className = 'help-label'; lbl.textContent = s.label;
      row.append(keys, lbl); listEl.appendChild(row);
    }
    if (!items.length) listEl.innerHTML = '<div class="help-empty">검색 결과 없음</div>';
  }
  search.addEventListener('input', _render);
  _render();

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeHelp(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _help = modal;
  search.focus();
  return { close: closeHelp };
}
function _onKey(e) { if (e.key === 'Escape') closeHelp(); }
export function closeHelp() { if (_help) { _help.remove(); _help = null; document.removeEventListener('keydown', _onKey, true); } }

// ── 처음 사용 안내(3단계 말풍선) ────────────────────────────────────────────
const STEPS = [
  { title: '1. 이미지 추가', body: '왼쪽 "프로젝트" 탭의 [가져오기]로 이미지를 넣고, 목록에서 화면으로 끌어 놓으세요. 캔버스로 파일을 끌어다 놓아도 됩니다.' },
  { title: '2. 움직임 · 효과', body: '왼쪽 "효과" 탭에서 효과·모션을 레이어에 끌어 놓고, 오른쪽 "효과 컨트롤" 탭에서 세기를 조절하세요.' },
  { title: '3. 내보내기', body: '오른쪽 위 [내보내기](Ctrl+E)로 APNG·WebP·GIF 로 저장하세요.' },
];

export function hasOnboarded() { try { return localStorage.getItem(ONBOARD_KEY) === '1'; } catch { return false; } }
function _markOnboarded() { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {} }

export function startOnboarding() {
  closeOnboarding();
  let i = 0;
  const overlay = document.createElement('div'); overlay.className = 'onboard-overlay';
  const bubble = document.createElement('div'); bubble.className = 'onboard-bubble';
  overlay.appendChild(bubble);

  function _render() {
    const s = STEPS[i];
    bubble.innerHTML = `
      <div class="onboard-step">${i + 1} / ${STEPS.length}</div>
      <div class="onboard-title"></div>
      <div class="onboard-body"></div>
      <div class="onboard-btns">
        <button class="quiet sm onboard-skip">건너뛰기</button>
        <button class="accent sm onboard-next">${i < STEPS.length - 1 ? '다음' : '시작'}</button>
      </div>`;
    bubble.querySelector('.onboard-title').textContent = s.title;
    bubble.querySelector('.onboard-body').textContent = s.body;
    bubble.querySelector('.onboard-skip').addEventListener('click', () => { _markOnboarded(); closeOnboarding(); });
    bubble.querySelector('.onboard-next').addEventListener('click', () => {
      if (i < STEPS.length - 1) { i++; _render(); } else { _markOnboarded(); closeOnboarding(); }
    });
  }
  _render();
  document.body.appendChild(overlay);
  _onboard = overlay;
  return { close: closeOnboarding };
}
export function closeOnboarding() { if (_onboard) { _onboard.remove(); _onboard = null; } }

// 첫 실행이면 안내 시작.
export function maybeStartOnboarding() { if (!hasOnboarded()) startOnboarding(); }
