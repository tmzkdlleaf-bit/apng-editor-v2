// R23c 2-2 — 도구 막대(메뉴 막대 아래 한 줄). 기존 캔버스 위 도구 버튼을 여기로 옮긴다.
//   tool 값은 지금 이름 그대로. 아이콘 + 짧은 이름 툴팁("선택 (V)"). 긴 설명은 넣지 않는다.
import { iconMarkup } from '../icons.js';

// [tool, 아이콘(name 또는 svg 문자열), 툴팁]. svg 는 마스크 도구처럼 아이콘 세트에 없는 것.
const MASK_RECT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="10" height="8" rx="1"/></svg>';
const MASK_ELL  = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="8" cy="8" rx="5.5" ry="4"/></svg>';
const PEN       = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-7 7-3.5.5.5-3.5z"/></svg>';

const TOOLS = [
  { tool: 'select',      icon: 'select-tool', tip: '선택 (V)' },
  { tool: 'hand',        icon: 'hand',        tip: '손 (H)' },
  { tool: 'zoom',        icon: 'zoom-in',     tip: '확대 (Z)' },
  { tool: 'edit',        icon: 'tool-edit',   tip: '편집 (E)' },
  { sep: true },
  { tool: 'maskRect',    svg: MASK_RECT,      tip: '사각형 가리기' },
  { tool: 'maskEllipse', svg: MASK_ELL,       tip: '타원 가리기' },
  { tool: 'pen',         svg: PEN,            tip: '펜' },
  { sep: true },
  { tool: 'text',        icon: 'type-text',   tip: '글자' },
  { tool: 'shape',       icon: 'type-shape',  tip: '도형' },
  { sep: true },
  { tool: 'motion',      icon: 'tool-motion', tip: '움직이기 (P)' },
];

export function createToolbar(editorState) {
  const el = document.createElement('div');
  el.className = 'toolbar';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', '도구');

  const btns = new Map();   // tool -> button
  for (const t of TOOLS) {
    if (t.sep) { const s = document.createElement('div'); s.className = 'toolbar-sep'; el.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'toolbar-btn'; b.type = 'button';
    b.dataset.tool = t.tool;
    b.title = t.tip; b.setAttribute('aria-label', t.tip);
    b.innerHTML = t.svg ?? iconMarkup(t.icon);
    b.addEventListener('click', () => editorState.set({ tool: t.tool }));
    el.appendChild(b);
    btns.set(t.tool, b);
  }

  function _sync() {
    const cur = editorState.get().tool;
    for (const [tool, b] of btns) b.classList.toggle('active', tool === cur);
  }
  const unsub = editorState.subscribe((p) => { if ('tool' in p) _sync(); });
  _sync();

  return { el, destroy() { unsub(); } };
}
