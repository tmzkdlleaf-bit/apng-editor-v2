// R23c 3부 — "새 장면" 창. 템플릿 갤러리 대신 새 프로젝트의 기본값을 정한다.
//   칸: 이름 · 크기 프리셋 · 가로·세로 · fps · 길이(프레임↔초 자동 계산) · 배경(투명/색).
//   크기 프리셋은 templates.js·export/presets.js 의 크기를 모은다. 숫자를 고치면 "사용자 지정"으로 바뀐다.
import { CANVAS_PRESETS } from './templates.js';
import { DEFAULT_PRESETS } from '../export/presets.js';
import { createDropdown } from './controls/dropdown.js';
import { createColorField } from './controls/color-field.js';

// 크기 프리셋 모으기 — 캔버스 프리셋 + 내보내기 프리셋 중 크기가 정해진 것(중복 크기는 생략).
function _sizePresets() {
  const out = CANVAS_PRESETS.map((p) => ({ key: p.key, label: p.label, w: p.w, h: p.h }));
  const seen = new Set(out.map((p) => `${p.w}x${p.h}`));
  for (const ep of DEFAULT_PRESETS) {
    if (ep.maxWidth && ep.maxHeight) {
      const k = `${ep.maxWidth}x${ep.maxHeight}`;
      if (!seen.has(k)) { out.push({ key: ep.id, label: ep.name, w: ep.maxWidth, h: ep.maxHeight }); seen.add(k); }
    }
  }
  return out;
}

let _open = null;
export function closeNewScene() { if (_open) { _open.remove(); _open = null; document.removeEventListener('keydown', _onKey, true); } }
function _onKey(e) { if (e.key === 'Escape') closeNewScene(); }

export function openNewScene(projectApi) {
  closeNewScene();
  const presets = _sizePresets();
  const def = presets[0] ?? { key: 'custom', w: 768, h: 768 };
  const state = { name: '새 장면', w: def.w, h: def.h, fps: 12, frames: 24, preset: def.key, bg: 'transparent', color: '#000000' };

  const modal = document.createElement('div'); modal.className = 'newscene-modal';
  const box = document.createElement('div'); box.className = 'newscene-box';
  box.innerHTML = '<div class="newscene-title">새 장면</div>';
  modal.appendChild(box);

  const _row = (label, ctrl) => {
    const r = document.createElement('div'); r.className = 'newscene-row';
    const l = document.createElement('label'); l.className = 'newscene-label'; l.textContent = label;
    r.append(l, ctrl); box.appendChild(r); return r;
  };
  const _num = (val, { min = 1, max = 99999, step = 1 } = {}) => {
    const i = document.createElement('input'); i.type = 'number'; i.className = 'num-input newscene-num';
    i.value = String(val); i.min = String(min); i.max = String(max); i.step = String(step); return i;
  };

  // 이름
  const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.className = 'newscene-name'; nameInput.value = state.name;
  nameInput.addEventListener('input', () => { state.name = nameInput.value; });
  _row('이름', nameInput);

  // 크기 프리셋
  const presetDd = createDropdown({
    ariaLabel: '크기 프리셋',
    options: [...presets.map((p) => ({ value: p.key, label: `${p.label} (${p.w}×${p.h})` })), { value: 'custom', label: '사용자 지정' }],
    value: state.preset,
    onChange: (v) => {
      state.preset = v;
      const p = presets.find((x) => x.key === v);
      if (p) { state.w = p.w; state.h = p.h; wInput.value = String(p.w); hInput.value = String(p.h); }
    },
  });
  _row('크기 프리셋', presetDd.el);

  // 가로·세로
  const wInput = _num(state.w); const hInput = _num(state.h);
  const _onSizeEdit = () => {
    state.w = Math.max(1, parseInt(wInput.value, 10) || state.w);
    state.h = Math.max(1, parseInt(hInput.value, 10) || state.h);
    // 프리셋과 다르면 "사용자 지정"으로.
    const match = presets.find((p) => p.w === state.w && p.h === state.h);
    const key = match ? match.key : 'custom';
    if (key !== state.preset) { state.preset = key; presetDd.setValue?.(key); }
  };
  wInput.addEventListener('change', _onSizeEdit); hInput.addEventListener('change', _onSizeEdit);
  const sizeWrap = document.createElement('div'); sizeWrap.className = 'newscene-size';
  const x = document.createElement('span'); x.textContent = '×'; x.className = 'newscene-x';
  sizeWrap.append(wInput, x, hInput);
  _row('가로 · 세로', sizeWrap);

  // fps
  const fpsInput = _num(state.fps, { min: 1, max: 120 });
  fpsInput.addEventListener('change', () => { state.fps = Math.max(1, parseInt(fpsInput.value, 10) || state.fps); _syncLen('frames'); });
  _row('FPS', fpsInput);

  // 길이: 프레임 ↔ 초 (한쪽 고치면 다른 쪽 자동)
  const framesInput = _num(state.frames, { min: 1, max: 99999 });
  const secInput = _num((state.frames / state.fps).toFixed(2), { min: 0.1, max: 600, step: 0.1 });
  function _syncLen(src) {
    if (src === 'frames') { state.frames = Math.max(1, parseInt(framesInput.value, 10) || state.frames); secInput.value = (state.frames / state.fps).toFixed(2); }
    else { const sec = Math.max(0.1, parseFloat(secInput.value) || 0.1); state.frames = Math.max(1, Math.round(sec * state.fps)); framesInput.value = String(state.frames); }
  }
  framesInput.addEventListener('change', () => _syncLen('frames'));
  secInput.addEventListener('change', () => _syncLen('sec'));
  const lenWrap = document.createElement('div'); lenWrap.className = 'newscene-len';
  const fLbl = document.createElement('span'); fLbl.className = 'newscene-unit'; fLbl.textContent = '프레임';
  const sLbl = document.createElement('span'); sLbl.className = 'newscene-unit'; sLbl.textContent = '초';
  lenWrap.append(framesInput, fLbl, secInput, sLbl);
  _row('길이', lenWrap);

  // 배경: 투명 / 색
  const bgDd = createDropdown({
    ariaLabel: '배경', value: state.bg,
    options: [{ value: 'transparent', label: '투명' }, { value: 'color', label: '색' }],
    onChange: (v) => { state.bg = v; colorField.el.style.display = (v === 'color') ? '' : 'none'; },
  });
  const colorField = createColorField({ value: state.color, onInput: (hex) => { state.color = hex; }, onChange: (hex) => { state.color = hex; } });
  colorField.el.style.display = 'none';
  const bgWrap = document.createElement('div'); bgWrap.className = 'newscene-bg'; bgWrap.append(bgDd.el, colorField.el);
  _row('배경', bgWrap);

  // 버튼
  const btns = document.createElement('div'); btns.className = 'newscene-btns';
  const cancel = document.createElement('button'); cancel.className = 'quiet'; cancel.textContent = '취소';
  cancel.addEventListener('click', closeNewScene);
  const create = document.createElement('button'); create.className = 'accent'; create.textContent = '만들기';
  create.addEventListener('click', async () => {
    const background = state.bg === 'color' ? { type: 'solid', color: state.color } : { type: 'transparent' };
    closeNewScene();
    await projectApi.newScene?.({
      name: state.name.trim() || '새 장면',
      width: state.w, height: state.h, fps: state.fps, frameCount: state.frames, background,
    });
  });
  btns.append(cancel, create);
  box.appendChild(btns);

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeNewScene(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _open = modal;
  nameInput.focus(); nameInput.select();
  return { close: closeNewScene };
}
