// 인스펙터 글자 섹션(F1-7) — 내용·폰트·크기·굵기·색·정렬·줄간격·자간·테두리·그림자.
// 글자 속성은 레이어 최상위 필드(정적) → setLayer 패치. 숫자/색 드래그는 begin/preview/commit = 되돌리기 1건.
// 타자기·글자별 애니메이션·캔버스 더블클릭 편집은 뒤 묶음(렌더 구현 포함).
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { createSliderField } from '../controls/slider-field.js';
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

  // ── 타자기 효과(reveal) ─────────────────────────────────────────────
  _subtitle(body, '타자기 효과');
  const rvEnable = _checkbox('글자가 차례로 나타남');
  const rvMode = createDropdown({
    ariaLabel: '타자기 단위',
    options: [{ value: 'char', label: '글자 단위' }, { value: 'word', label: '단어 단위' }],
    onChange: (v) => { _begin('타자기'); _setObj('reveal', { mode: v }, true); _commit(); },
  });
  const rvCursor = _checkbox('커서 표시');
  const rvStart = createNumberField({
    label: '시작 프레임', min: 0, max: 9999, step: 1, defaultValue: 0,
    onBegin: () => _begin('타자기'), onChange: (v) => { if (_batch) _setObj('reveal', { startF: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const rvEnd = createNumberField({
    label: '끝 프레임', min: 0, max: 9999, step: 1, defaultValue: 12,
    onBegin: () => _begin('타자기'), onChange: (v) => { if (_batch) _setObj('reveal', { endF: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const rvLoop = createDropdown({
    ariaLabel: '타자기 반복',
    options: [{ value: 'once', label: '1회' }, { value: 'loop', label: '반복' }],
    onChange: (v) => { _begin('타자기'); _setObj('reveal', { loop: v }, true); _commit(); },
  });
  const rvModeRow = _row('단위', rvMode.el);
  const rvStartRow = document.createElement('div'); rvStartRow.className = 'prop-row'; rvStartRow.appendChild(rvStart.el);
  const rvEndRow = document.createElement('div'); rvEndRow.className = 'prop-row'; rvEndRow.appendChild(rvEnd.el);
  const rvLoopRow = _row('반복', rvLoop.el);
  body.append(rvEnable.row, rvModeRow, rvCursor.row, rvStartRow, rvEndRow, rvLoopRow);
  rvEnable.input.addEventListener('change', () => {
    _begin('타자기');
    const fc = store.get().meta.frameCount ?? 24;
    _set({ reveal: rvEnable.input.checked ? { mode: 'char', cursor: true, startF: 0, endF: fc - 1, loop: 'once' } : null }, true);
    _commit(); _refresh();
  });
  rvCursor.input.addEventListener('change', () => { _begin('타자기'); _setObj('reveal', { cursor: rvCursor.input.checked }, true); _commit(); });

  // ── 글자별 애니메이션(charAnim) ─────────────────────────────────────
  _subtitle(body, '글자별 애니메이션');
  const caEnable = _checkbox('글자마다 등장 애니메이션');
  const caType = createDropdown({
    ariaLabel: '애니메이션 종류',
    options: [{ value: 'fade', label: '페이드' }, { value: 'slideup', label: '슬라이드업' }, { value: 'pop', label: '팝' }],
    onChange: (v) => { _begin('글자 애니'); _setObj('charAnim', { type: v }, true); _commit(); },
  });
  const caStagger = createSliderField({
    label: '시차', min: 0, max: 95, step: 1, unit: '%', defaultValue: 70,
    onBegin: () => _begin('글자 애니'), onChange: (v) => { if (_batch) _setObj('charAnim', { stagger: v / 100 }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const caStart = createNumberField({
    label: '시작 프레임', min: 0, max: 9999, step: 1, defaultValue: 0,
    onBegin: () => _begin('글자 애니'), onChange: (v) => { if (_batch) _setObj('charAnim', { startF: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const caEnd = createNumberField({
    label: '끝 프레임', min: 0, max: 9999, step: 1, defaultValue: 12,
    onBegin: () => _begin('글자 애니'), onChange: (v) => { if (_batch) _setObj('charAnim', { endF: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const caLoop = createDropdown({
    ariaLabel: '글자 애니 반복',
    options: [{ value: 'once', label: '1회' }, { value: 'loop', label: '반복' }, { value: 'pingpong', label: '핑퐁' }],
    onChange: (v) => { _begin('글자 애니'); _setObj('charAnim', { loop: v }, true); _commit(); },
  });
  const caTypeRow = _row('종류', caType.el);
  const caStaggerRow = document.createElement('div'); caStaggerRow.className = 'prop-row'; caStaggerRow.appendChild(caStagger.el);
  const caStartRow = document.createElement('div'); caStartRow.className = 'prop-row'; caStartRow.appendChild(caStart.el);
  const caEndRow = document.createElement('div'); caEndRow.className = 'prop-row'; caEndRow.appendChild(caEnd.el);
  const caLoopRow = _row('반복', caLoop.el);
  body.append(caEnable.row, caTypeRow, caStaggerRow, caStartRow, caEndRow, caLoopRow);
  caEnable.input.addEventListener('change', () => {
    _begin('글자 애니');
    const fc = store.get().meta.frameCount ?? 24;
    _set({ charAnim: caEnable.input.checked ? { type: 'fade', stagger: 0.7, startF: 0, endF: fc - 1, loop: 'once' } : null }, true);
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
    // item 10: 여러 선택 시 값이 다르면 숫자 칸 '혼합'
    const multi = list.length > 1;
    const diff = (key, def) => { const a = list.map((id) => doc.layers[id][key] ?? def); return !a.every((v) => v === a[0]); };
    const setNum = (field, key, def) => { if (multi && diff(key, def)) field.setMixed(t[key] ?? def); else field.setValue(t[key] ?? def); };

    if (document.activeElement !== textarea) textarea.value = multi && diff('text', '') ? '' : (t.text ?? '');
    fontDd.setValue(t.font ?? 'IBM Plex Sans KR');
    setNum(sizeField, 'size', 48);
    weightDd.setValue(String(t.weight ?? 400));
    color.setValue(t.color ?? '#ffffff');
    alignDd.setValue(t.align ?? 'center');
    setNum(lhField, 'lineHeight', 1.3);
    setNum(lsField, 'letterSpacing', 0);

    const st = t.stroke;
    strokeEnable.input.checked = !!st;
    strokeWRow.style.display = st ? '' : 'none';
    strokeCRow.style.display = st ? '' : 'none';
    if (st) { strokeWidth.setValue(st.width ?? 2); strokeColor.setValue(st.color ?? '#000000'); }

    const sh = t.shadow;
    shadowEnable.input.checked = !!sh;
    for (const r of [shBlurRow, shXYRow, shCRow]) r.style.display = sh ? '' : 'none';
    if (sh) { shBlur.setValue(sh.blur ?? 0); shDx.setValue(sh.offsetX ?? 2); shDy.setValue(sh.offsetY ?? 2); shadowColor.setValue(sh.color ?? '#000000'); }

    const rv = t.reveal;
    rvEnable.input.checked = !!rv;
    for (const r of [rvModeRow, rvCursor.row, rvStartRow, rvEndRow, rvLoopRow]) r.style.display = rv ? '' : 'none';
    if (rv) {
      rvMode.setValue(rv.mode ?? 'char'); rvCursor.input.checked = rv.cursor !== false;
      rvStart.setValue(rv.startF ?? 0); rvEnd.setValue(rv.endF ?? 12); rvLoop.setValue(rv.loop ?? 'once');
    }

    const ca = t.charAnim;
    caEnable.input.checked = !!ca;
    for (const r of [caTypeRow, caStaggerRow, caStartRow, caEndRow, caLoopRow]) r.style.display = ca ? '' : 'none';
    if (ca) {
      caType.setValue(ca.type ?? 'fade'); caStagger.setValue(Math.round((ca.stagger ?? 0.7) * 100));
      caStart.setValue(ca.startF ?? 0); caEnd.setValue(ca.endF ?? 12); caLoop.setValue(ca.loop ?? 'once');
    }
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() {
    unsubStore(); unsubES();
    fontDd.destroy(); weightDd.destroy(); alignDd.destroy();
    color.destroy(); strokeColor.destroy(); shadowColor.destroy();
    rvMode.destroy(); rvLoop.destroy(); caType.destroy(); caLoop.destroy();
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
