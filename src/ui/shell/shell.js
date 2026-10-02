import { toggle as toggleTheme, current as currentTheme } from './theme.js';
import { initStage } from '../canvas/stage.js';
import { initKeys } from '../keys.js';

const TL_KEY = 'apng2.timelineHeight';
const TL_DEFAULT = 340;
const TL_MIN = 200;
const TL_MAX = 600;

function getStoredTlHeight() {
  try {
    const v = parseInt(localStorage.getItem(TL_KEY), 10);
    return Number.isFinite(v) ? Math.min(TL_MAX, Math.max(TL_MIN, v)) : TL_DEFAULT;
  } catch {
    return TL_DEFAULT;
  }
}

function saveTlHeight(h) {
  try {
    localStorage.setItem(TL_KEY, String(h));
  } catch {
    // storage unavailable
  }
}

function setTlHeight(mainArea, h) {
  const clamped = Math.min(TL_MAX, Math.max(TL_MIN, h));
  mainArea.style.gridTemplateRows = `1fr ${clamped}px`;
  saveTlHeight(clamped);
}

export function init(store, editorState) {
  const app = document.createElement('div');
  app.id = 'app';

  app.innerHTML = `
    <div data-region="topbar">
      <div class="topbar-left">
        <span class="app-title">코코포리아 APNG 에디터</span>
        <button class="project-name-btn" aria-label="프로젝트 이름">새 프로젝트 ▾</button>
      </div>
      <div class="sep"></div>
      <button data-action="undo" title="되돌리기 (Ctrl+Z)">되돌리기</button>
      <button data-action="redo" title="다시하기 (Ctrl+Shift+Z)">다시하기</button>
      <div class="topbar-center"></div>
      <div class="topbar-right">
        <span class="canvas-info" id="canvas-info">-</span>
        <div class="sep"></div>
        <button data-action="toggle-theme" id="btn-theme" title="테마 전환">
          ${currentTheme() === 'dark' ? '라이트' : '다크'}
        </button>
        <button data-action="help" title="도움말">?</button>
        <div class="sep"></div>
        <button data-action="export" class="accent">내보내기</button>
      </div>
    </div>

    <div id="main-area">
      <div data-region="canvas"></div>

      <div data-region="timeline" style="position:relative;">
        <div class="resize-handle" id="tl-resize"></div>
        <div class="timeline-head">
          <button data-action="play" title="재생/정지">재생</button>
          <span class="sep"></span>
          <span class="tl-frame-info">프레임: -/-</span>
          <span class="sep"></span>
          <button data-action="loop-mode">반복 ▾</button>
          <button data-action="auto-key">자동 키</button>
          <button data-action="snap">스냅</button>
        </div>
        <div class="timeline-body">
          <div class="timeline-layers"></div>
          <div class="timeline-tracks"></div>
        </div>
      </div>
    </div>

    <div data-region="inspector"></div>
  `;

  document.body.appendChild(app);

  const mainArea = app.querySelector('#main-area');
  setTlHeight(mainArea, getStoredTlHeight());

  const themeBtn = app.querySelector('#btn-theme');
  themeBtn.addEventListener('click', () => {
    toggleTheme();
    themeBtn.textContent = currentTheme() === 'dark' ? '라이트' : '다크';
  });

  // 되돌리기 / 다시하기 버튼
  app.querySelector('[data-action="undo"]').addEventListener('click', () => store.undo());
  app.querySelector('[data-action="redo"]').addEventListener('click', () => store.redo());

  const handle = app.querySelector('#tl-resize');
  const tlRegion = app.querySelector('[data-region="timeline"]');

  let dragging = false;
  let startY = 0;
  let startH = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = tlRegion.getBoundingClientRect().height;
    handle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    setTlHeight(mainArea, startH + delta);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
  });

  // 캔버스 스테이지
  const canvasRegion = app.querySelector('[data-region="canvas"]');
  const stage = initStage(canvasRegion, store, editorState);

  // 키보드 단축키
  initKeys(store, editorState);

  return stage;
}
