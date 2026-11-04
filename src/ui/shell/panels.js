// R23 — 전문가 화면 틀: 도킹 패널 프레임. 경계 끌기(크기 조절)·접기·탭 전환 + 배치 localStorage 저장.
//   읽기/쓰기는 모두 try/catch — localStorage 가 막힌 환경에서도 기본 배치로 동작한다.
//   자유 도킹(탭을 임의 패널로 옮기기)은 이번 범위가 아니다(경계 끌기+접기+저장까지).

const WS_PREFIX = 'apng2.ws.';
const _docKeys = new Set();   // 작업 공간 초기화 때 지울 키 모음

function _clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function _load(key) {
  try {
    const v = JSON.parse(localStorage.getItem(WS_PREFIX + key));
    return (v && typeof v === 'object') ? v : {};
  } catch { return {}; }
}
function _save(key, state) {
  try { localStorage.setItem(WS_PREFIX + key, JSON.stringify(state)); } catch {}
}

// 저장된 모든 패널 배치를 지운다(메뉴 "보기 › 작업 공간 초기화").
export function resetWorkspace() {
  for (const key of _docKeys) { try { localStorage.removeItem(WS_PREFIX + key); } catch {} }
}

// side: 'left' | 'right'. tabs: [{ id, label, el }]. widthVar: 그리드 폭을 잇는 CSS 변수 이름.
export function createPanelDock({
  side = 'right', key, tabs = [], defaultWidth = 320, minWidth = 200, maxWidth = 560,
  widthVar, collapsedWidth = 28, startCollapsed = false, defaultActive = null,
}) {
  _docKeys.add(key);
  const saved = _load(key);
  const _fallbackActive = (defaultActive && tabs.some((t) => t.id === defaultActive)) ? defaultActive : (tabs[0]?.id ?? null);
  const state = {
    width: _clamp(Number.isFinite(saved.width) ? saved.width : defaultWidth, minWidth, maxWidth),
    collapsed: (saved.collapsed != null) ? !!saved.collapsed : !!startCollapsed,
    active: (saved.active && tabs.some((t) => t.id === saved.active)) ? saved.active : _fallbackActive,
  };

  const col = document.createElement('div');
  col.className = `panel-dock panel-dock-${side}`;
  col.dataset.dockKey = key;

  // 경계 끌기 스플리터 — 바깥쪽(화면 가운데와 맞닿는) 변에 둔다.
  const splitter = document.createElement('div');
  splitter.className = `panel-splitter panel-splitter-${side}`;
  splitter.setAttribute('role', 'separator');
  splitter.setAttribute('aria-label', '패널 크기 조절');

  // 헤더: 탭 버튼 + 접기 토글
  const header = document.createElement('div');
  header.className = 'panel-head';
  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'panel-tabs';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'panel-collapse';
  collapseBtn.setAttribute('aria-label', '패널 접기');
  header.append(tabsWrap, collapseBtn);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'panel-bodies';

  col.append(splitter, header, bodyWrap);

  const tabEls = new Map();   // id -> { btn, el }
  function _addTab(t) {
    const btn = document.createElement('button');
    btn.className = 'panel-tab';
    btn.textContent = t.label;
    btn.dataset.tabId = t.id;
    btn.addEventListener('click', () => setActive(t.id));
    tabsWrap.appendChild(btn);
    t.el.classList.add('panel-tab-body');
    bodyWrap.appendChild(t.el);
    tabEls.set(t.id, { btn, el: t.el });
  }
  for (const t of tabs) _addTab(t);

  function setActive(id) {
    if (!tabEls.has(id)) return;
    state.active = id;
    for (const [tid, { btn, el }] of tabEls) {
      const on = tid === id;
      btn.classList.toggle('is-on', on);
      el.style.display = on ? '' : 'none';
    }
    _persist();
  }

  function _applyWidth() {
    col.classList.toggle('is-collapsed', state.collapsed);
    const w = state.collapsed ? collapsedWidth : state.width;
    col.style.width = w + 'px';
    if (widthVar) document.documentElement.style.setProperty(widthVar, w + 'px');
    collapseBtn.classList.toggle('is-collapsed', state.collapsed);
    collapseBtn.setAttribute('aria-label', state.collapsed ? '패널 펼치기' : '패널 접기');
  }

  function _persist() { _save(key, { width: state.width, collapsed: state.collapsed, active: state.active }); }

  collapseBtn.addEventListener('click', () => {
    state.collapsed = !state.collapsed;
    _applyWidth(); _persist();
  });

  // ── 경계 끌기 ──────────────────────────────────────────────────────────
  let _drag = null;
  splitter.addEventListener('pointerdown', (e) => {
    if (state.collapsed) return;
    _drag = { startX: e.clientX, startW: state.width };
    splitter.setPointerCapture?.(e.pointerId);
    splitter.classList.add('dragging');
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!_drag) return;
    // 오른쪽 패널은 왼쪽으로 끌면 넓어지고, 왼쪽 패널은 오른쪽으로 끌면 넓어진다.
    const dx = e.clientX - _drag.startX;
    const next = side === 'right' ? _drag.startW - dx : _drag.startW + dx;
    state.width = _clamp(Math.round(next), minWidth, maxWidth);
    _applyWidth();
  });
  function _endDrag(e) {
    if (!_drag) return;
    _drag = null;
    splitter.classList.remove('dragging');
    try { splitter.releasePointerCapture?.(e.pointerId); } catch {}
    _persist();
  }
  splitter.addEventListener('pointerup', _endDrag);
  splitter.addEventListener('pointercancel', _endDrag);

  function reset() {
    state.width = defaultWidth; state.collapsed = false; state.active = _fallbackActive;
    _applyWidth(); if (state.active) setActive(state.active); _persist();
  }

  _applyWidth();
  if (state.active) setActive(state.active);

  return {
    el: col,
    bodyOf: (id) => tabEls.get(id)?.el ?? null,
    setActive, reset,
    collapse(v = true) { state.collapsed = v; _applyWidth(); _persist(); },
    getState: () => ({ ...state }),
  };
}
