// 인스펙터 모습 섹션 — 블렌드·불투명도 + (도형) 크기·채우기 + (글자) 내용·크기·색
import { createNumberField } from '../controls/number-field.js';
import { makeSectionShell } from './section-shell.js';

const _BLEND = [
  ['normal', '보통'], ['multiply', '곱하기'], ['screen', '스크린'], ['overlay', '오버레이'],
  ['darken', '어둡게'], ['lighten', '밝게'], ['color-dodge', '닷지'], ['color-burn', '번'],
  ['hard-light', '강한 빛'], ['soft-light', '부드러운 빛'], ['difference', '차이'], ['exclusion', '제외'],
];

export function createAppearanceSection(store, editorState) {
  const { section, body } = makeSectionShell('모습', false);

  // ── 블렌드 ──────────────────────────────────────────────────────────
  const blendRow = document.createElement('div');
  blendRow.className = 'prop-row';
  const blendLabel = document.createElement('label');
  blendLabel.className = 'num-label';
  blendLabel.textContent = '블렌드';
  const blendSel = document.createElement('select');
  blendSel.className = 'blend-select';
  for (const [v, ko] of _BLEND) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = ko;
    blendSel.appendChild(opt);
  }
  blendRow.append(blendLabel, blendSel);
  blendSel.addEventListener('change', () => {
    const ids = editorState.get().selection;
    const cmds = ids.map(id => ({ type: 'setLayer', id, patch: { blend: blendSel.value } }));
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  });

  // ── 불투명도 ────────────────────────────────────────────────────────
  let _opBatch = false;
  const opacityField = createNumberField({
    label: '불투명도', step: 1, min: 0, max: 100, unit: '%', defaultValue: 100,
    onBegin() { if (_opBatch) return; _opBatch = true; store.begin('불투명도'); },
    onChange(v) {
      if (!_opBatch) return;
      const ids = editorState.get().selection;
      const opacity = Math.round(v) / 100;
      const cmds = ids.map(id => ({ type: 'setLayer', id, patch: { opacity } }));
      if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    },
    onCommit() { _opBatch = false; store.commit(); },
    onCancel() { _opBatch = false; store.cancel(); },
  });

  body.append(blendRow, opacityField.el);

  // ── 도형 그룹 ───────────────────────────────────────────────────────
  const shapeWrap = document.createElement('div');
  shapeWrap.className = 'appearance-group';
  const shapeTitle = document.createElement('div');
  shapeTitle.className = 'appearance-subtitle';
  shapeTitle.textContent = '도형';
  const sizeRow = document.createElement('div'); sizeRow.className = 'prop-row-2';
  let _shapeBatch = false;
  const wField = createNumberField({
    label: 'W', step: 1, min: 1, max: 9999, defaultValue: 100,
    onBegin() { if (_shapeBatch) return; _shapeBatch = true; store.begin('도형 크기'); },
    onChange(v) { if (_shapeBatch) _previewShape({ w: v }); },
    onCommit() { _shapeBatch = false; store.commit(); },
    onCancel() { _shapeBatch = false; store.cancel(); },
  });
  const hField = createNumberField({
    label: 'H', step: 1, min: 1, max: 9999, defaultValue: 100,
    onBegin() { if (_shapeBatch) return; _shapeBatch = true; store.begin('도형 크기'); },
    onChange(v) { if (_shapeBatch) _previewShape({ h: v }); },
    onCommit() { _shapeBatch = false; store.commit(); },
    onCancel() { _shapeBatch = false; store.cancel(); },
  });
  sizeRow.append(wField.el, hField.el);
  const fillRow = document.createElement('div'); fillRow.className = 'prop-row';
  const fillLabel = document.createElement('label');
  fillLabel.className = 'num-label'; fillLabel.textContent = '채우기';
  const fillInput = document.createElement('input');
  fillInput.type = 'color'; fillInput.className = 'color-input';
  fillRow.append(fillLabel, fillInput);
  fillInput.addEventListener('input', () => _applyShape({ fill: fillInput.value }));
  shapeWrap.append(shapeTitle, sizeRow, fillRow);
  body.appendChild(shapeWrap);

  // ── 글자 그룹 ───────────────────────────────────────────────────────
  const textWrap = document.createElement('div');
  textWrap.className = 'appearance-group';
  const textTitle = document.createElement('div');
  textTitle.className = 'appearance-subtitle';
  textTitle.textContent = '글자';
  const contentRow = document.createElement('div'); contentRow.className = 'prop-row';
  const textarea = document.createElement('textarea');
  textarea.className = 'text-input-area'; textarea.rows = 2;
  textarea.style.cssText = 'width:100%; resize:vertical; font:inherit; background:var(--bg2); color:var(--fg); border:1px solid var(--line2); padding:4px; font-size:12px; box-sizing:border-box;';
  contentRow.appendChild(textarea);
  let _textTimer = null;
  textarea.addEventListener('input', () => {
    clearTimeout(_textTimer);
    _textTimer = setTimeout(() => _applyText({ text: textarea.value }), 200);
  });
  const txtRow = document.createElement('div'); txtRow.className = 'prop-row-2';
  let _textBatch = false;
  const sizeTextField = createNumberField({
    label: '크기', step: 1, min: 1, max: 999, defaultValue: 48,
    onBegin() { if (_textBatch) return; _textBatch = true; store.begin('글자 크기'); },
    onChange(v) { if (_textBatch) _previewText({ size: v }); },
    onCommit() { _textBatch = false; store.commit(); },
    onCancel() { _textBatch = false; store.cancel(); },
  });
  txtRow.append(sizeTextField.el);
  const colorRow = document.createElement('div'); colorRow.className = 'prop-row';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'num-label'; colorLabel.textContent = '색상';
  const colorInput = document.createElement('input');
  colorInput.type = 'color'; colorInput.className = 'color-input';
  colorRow.append(colorLabel, colorInput);
  colorInput.addEventListener('input', () => _applyText({ color: colorInput.value }));
  textWrap.append(textTitle, contentRow, txtRow, colorRow);
  body.appendChild(textWrap);

  // ── 적용 헬퍼 ───────────────────────────────────────────────────────
  function _shapeIds() {
    const doc = store.get();
    return editorState.get().selection.filter(id => doc.layers[id]?.type === 'shape');
  }
  function _textIds() {
    const doc = store.get();
    return editorState.get().selection.filter(id => doc.layers[id]?.type === 'text');
  }
  function _previewShape(props) {
    const doc = store.get();
    const cmds = _shapeIds().map(id => ({ type: 'setLayer', id, patch: { shape: { ...doc.layers[id].shape, ...props } } }));
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _applyShape(props) {
    const doc = store.get();
    const cmds = _shapeIds().map(id => ({ type: 'setLayer', id, patch: { shape: { ...doc.layers[id].shape, ...props } } }));
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _previewText(props) {
    const cmds = _textIds().map(id => ({ type: 'setLayer', id, patch: props }));
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _applyText(props) {
    const cmds = _textIds().map(id => ({ type: 'setLayer', id, patch: props }));
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  function _refresh() {
    if (_opBatch || _shapeBatch || _textBatch) return;
    const ids = editorState.get().selection;
    const doc = store.get();
    if (!ids.length) return;
    const first = doc.layers[ids[0]];
    if (!first) return;

    blendSel.value = first.blend ?? 'normal';
    opacityField.setValue(Math.round((first.opacity ?? 1) * 100));

    const shapeLayers = _shapeIds().map(id => doc.layers[id]);
    shapeWrap.style.display = shapeLayers.length ? '' : 'none';
    if (shapeLayers.length) {
      const sh = shapeLayers[0].shape ?? {};
      wField.setValue(sh.w ?? 100);
      hField.setValue(sh.h ?? 100);
      if (sh.fill) fillInput.value = sh.fill;
    }

    const textLayers = _textIds().map(id => doc.layers[id]);
    textWrap.style.display = textLayers.length ? '' : 'none';
    if (textLayers.length) {
      const t = textLayers[0];
      if (document.activeElement !== textarea) textarea.value = t.text ?? '';
      sizeTextField.setValue(t.size ?? 48);
      if (t.color) colorInput.value = t.color;
    }
  }

  const unsubStore = store.subscribe({ layers: true }, () => _refresh());
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); clearTimeout(_textTimer); }
  return { el: section, destroy };
}
