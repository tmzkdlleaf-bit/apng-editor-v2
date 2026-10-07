// 인스펙터 글자 섹션(F1-7) — 내용·폰트·크기·굵기·색·정렬·줄간격·자간·테두리·그림자.
// 글자 속성은 레이어 최상위 필드(정적) → setLayer 패치. 숫자/색 드래그는 begin/preview/commit = 되돌리기 1건.
// 타자기·글자별 애니메이션·캔버스 더블클릭 편집은 뒤 묶음(렌더 구현 포함).
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { createColorField } from '../controls/color-field.js';

// 폰트 목록(old/src/inspector/text.js 기준). 웹 폰트는 index.html 의 구글 폰트 CSS 로만 로드.
const FONTS = [
  { value: 'IBM Plex Sans KR', label: 'IBM Plex Sans KR' },
  { value: 'sans-serif',       label: '기본 산세리프' },
  { value: 'serif',            label: '기본 세리프' },
  { value: 'monospace',        label: '기본 고정폭' },
  { value: 'Noto Sans KR',     label: 'Noto Sans KR' },
  { value: 'Noto Serif KR',    label: 'Noto Serif KR' },
  { value: 'Black Han Sans',   label: 'Black Han Sans' },
];
const WEIGHTS = [
  { value: '300', label: '가늘게 (300)' },
  { value: '400', label: '보통 (400)' },
  { value: '500', label: '중간 (500)' },
  { value: '700', label: '굵게 (700)' },
  { value: '900', label: '아주 굵게 (900)' },
];
const ALIGNS = [
  { value: 'left',   label: '왼쪽' },
  { value: 'center', label: '중앙' },
  { value: 'right',  label: '오른쪽' },
];

export function createTextSection(store, editorState) {
  const { section, body } = makeSectionShell('글자', false);
  let _batch = false;

  const ids = () => {
    const doc = store.get();
    return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'text');
  };
  function _begin(label) { if (_batch) return; _batch = true; store.begin(label || '글자'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }
  // 레이어 최상위 필드 patch
  function _set(patch, preview) {
    const list = ids();
    const cmds = list.map((id) => ({ type: 'setLayer', id, patch }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }
  // 중첩 객체(stroke/shadow) 병합 patch
  function _setObj(key, partial, preview) {
    const doc = store.get();
    const cmds = ids().map((id) => ({ type: 'setLayer', id, patch: { [key]: { ...(doc.layers[id][key] ?? {}), ...partial } } }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  // ── 내용 ────────────────────────────────────────────────────────────
  const taRow = document.createElement('div'); taRow.className = 'prop-row prop-col';
  const taLabel = document.createElement('label'); taLabel.className = 'num-label'; taLabel.textContent = '내용';
  const textarea = document.createElement('textarea');
  textarea.className = 'text-content-area'; textarea.rows = 2;
  taRow.append(taLabel, textarea);
  body.appendChild(taRow);
  textarea.addEventListener('focus', () => _begin('글자 내용'));
  textarea.addEventListener('input', () => { if (_batch) _set({ text: textarea.value }, true); });
  textarea.addEventListener('blur', () => _commit());

  // ── 폰트 · 크기 · 굵기 ──────────────────────────────────────────────
  const fontDd = createDropdown({
    ariaLabel: '폰트', options: FONTS,
    onChange: (v) => { _begin('폰트'); _set({ font: v }, true); _commit(); },
  });
  body.appendChild(_row('폰트', fontDd.el));

  const sizeField = createNumberField({
    label: '크기', min: 4, max: 400, step: 1, unit: 'px', defaultValue: 48,
    onBegin: () => _begin('글자 크기'), onChange: (v) => { if (_batch) _set({ size: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const sizeRow = document.createElement('div'); sizeRow.className = 'prop-row'; sizeRow.appendChild(sizeField.el);
  body.appendChild(sizeRow);

  const weightDd = createDropdown({
    ariaLabel: '굵기', options: WEIGHTS, value: '400',
    onChange: (v) => { _begin('굵기'); _set({ weight: parseInt(v, 10) }, true); _commit(); },
  });
  body.appendChild(_row('굵기', weightDd.el));

  // ── 색 · 정렬 ───────────────────────────────────────────────────────
  const color = createColorField({
    value: '#ffffff',
    onInput: (hex) => { _begin('글자 색'); _set({ color: hex }, true); },
    onChange: (hex) => { _begin('글자 색'); _set({ color: hex }, true); _commit(); },
  });
  body.appendChild(_row('색', color.el));

  const alignDd = createDropdown({
    ariaLabel: '정렬', options: ALIGNS, value: 'center',
    onChange: (v) => { _begin('정렬'); _set({ align: v }, true); _commit(); },
  });
  body.appendChild(_row('정렬', alignDd.el));

  // ── 줄간격 · 자간 ───────────────────────────────────────────────────
  const lhField = createNumberField({
    label: '줄간격', min: 0.5, max: 3, step: 0.05, defaultValue: 1.3,
    onBegin: () => _begin('줄간격'), onChange: (v) => { if (_batch) _set({ lineHeight: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const lsField = createNumberField({
    label: '자간', min: -10, max: 50, step: 1, unit: 'px', defaultValue: 0,
    onBegin: () => _begin('자간'), onChange: (v) => { if (_batch) _set({ letterSpacing: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const lhlsRow = document.createElement('div'); lhlsRow.className = 'prop-row-2';
  lhlsRow.append(lhField.el, lsField.el);
  body.appendChild(lhlsRow);

  // ── 테두리 ──────────────────────────────────────────────────────────
  _subtitle(body, '테두리');
  const strokeEnable = _checkbox('테두리 사용');
  const strokeWidth = createNumberField({
    label: '두께', min: 0, max: 20, step: 0.5, unit: 'px', defaultValue: 2,
    onBegin: () => _begin('테두리'), onChange: (v) => { if (_batch) _setObj('stroke', { width: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const strokeColor = createColorField({
    value: '#000000',
    onInput: (hex) => { _begin('테두리 색'); _setObj('stroke', { color: hex }, true); },
    onChange: (hex) => { _begin('테두리 색'); _setObj('stroke', { color: hex }, true); _commit(); },
  });
  const strokeWRow = document.createElement('div'); strokeWRow.className = 'prop-row'; strokeWRow.appendChild(strokeWidth.el);
  const strokeCRow = _row('색', strokeColor.el);
  body.append(strokeEnable.row, strokeWRow, strokeCRow);
  strokeEnable.input.addEventListener('change', () => {
    _begin('테두리');
    _set({ stroke: strokeEnable.input.checked ? { width: 2, color: '#000000' } : null }, true);
    _commit(); _refresh();
  });

  // ── 그림자 ──────────────────────────────────────────────────────────
  _subtitle(body, '그림자');
  const shadowEnable = _checkbox('그림자 사용');
  const shBlur = createNumberField({
    label: '흐림', min: 0, max: 30, step: 1, unit: 'px', defaultValue: 4,
    onBegin: () => _begin('그림자'), onChange: (v) => { if (_batch) _setObj('shadow', { blur: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const shDx = createNumberField({
    label: 'X', min: -30, max: 30, step: 1, defaultValue: 2,
    onBegin: () => _begin('그림자'), onChange: (v) => { if (_batch) _setObj('shadow', { offsetX: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const shDy = createNumberField({
    label: 'Y', min: -30, max: 30, step: 1, defaultValue: 2,
    onBegin: () => _begin('그림자'), onChange: (v) => { if (_batch) _setObj('shadow', { offsetY: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const shadowColor = createColorField({
    value: '#000000',
    onInput: (hex) => { _begin('그림자 색'); _setObj('shadow', { color: hex }, true); },
    onChange: (hex) => { _begin('그림자 색'); _setObj('shadow', { color: hex }, true); _commit(); },
  });
  const shBlurRow = document.createElement('div'); shBlurRow.className = 'prop-row'; shBlurRow.appendChild(shBlur.el);
  const shXYRow = document.createElement('div'); shXYRow.className = 'prop-row-2'; shXYRow.append(shDx.el, shDy.el);
  const shCRow = _row('색', shadowColor.el);
  body.append(shadowEnable.row, shBlurRow, shXYRow, shCRow);
  shadowEnable.input.addEventListener('change', () => {
    _begin('그림자');
    _set({ shadow: shadowEnable.input.checked ? { blur: 4, offsetX: 2, offsetY: 2, color: '#000000' } : null }, true);
    _commit(); _refresh();
  });

  // ── 새로고침 ────────────────────────────────────────────────────────
  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const doc = store.get();
    const t = doc.layers[list[0]];
    if (document.activeElement !== textarea) textarea.value = t.text ?? '';
    fontDd.setValue(t.font ?? 'IBM Plex Sans KR');
    sizeField.setValue(t.size ?? 48);
    weightDd.setValue(String(t.weight ?? 400));
    color.setValue(t.color ?? '#ffffff');
    alignDd.setValue(t.align ?? 'center');
    lhField.setValue(t.lineHeight ?? 1.3);
    lsField.setValue(t.letterSpacing ?? 0);

    const st = t.stroke;
    strokeEnable.input.checked = !!st;
    strokeWRow.style.display = st ? '' : 'none';
    strokeCRow.style.display = st ? '' : 'none';
    if (st) { strokeWidth.setValue(st.width ?? 2); strokeColor.setValue(st.color ?? '#000000'); }

    const sh = t.shadow;
    shadowEnable.input.checked = !!sh;
    for (const r of [shBlurRow, shXYRow, shCRow]) r.style.display = sh ? '' : 'none';
    if (sh) { shBlur.setValue(sh.blur ?? 0); shDx.setValue(sh.offsetX ?? 2); shDy.setValue(sh.offsetY ?? 2); shadowColor.setValue(sh.color ?? '#000000'); }
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() {
    unsubStore(); unsubES();
    fontDd.destroy(); weightDd.destroy(); alignDd.destroy();
    color.destroy(); strokeColor.destroy(); shadowColor.destroy();
  }
  return { el: section, destroy };
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────
function _row(labelText, controlEl) {
  const row = document.createElement('div'); row.className = 'prop-row';
  const label = document.createElement('label'); label.className = 'num-label'; label.textContent = labelText;
  row.append(label, controlEl);
  return row;
}
function _subtitle(parent, text) {
  const d = document.createElement('div'); d.className = 'adj-subtitle'; d.textContent = text;
  parent.appendChild(d);
}
function _checkbox(labelText) {
  const row = document.createElement('div'); row.className = 'prop-row';
  const label = document.createElement('label'); label.className = 'fx-check';
  const input = document.createElement('input'); input.type = 'checkbox';
  const span = document.createElement('span'); span.textContent = labelText;
  label.append(input, span); row.appendChild(label);
  return { row, input };
}
