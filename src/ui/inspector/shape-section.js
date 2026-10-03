// 인스펙터 도형 섹션 — 채우기, 테두리, 모서리
import { createNumberField } from '../controls/number-field.js';

export function createShapeSection(store, editorState) {
  const section = document.createElement('div');
  section.className = 'inspector-section';

  const header = document.createElement('div');
  header.className = 'inspector-section-header';
  const title   = document.createElement('span');
  title.className = 'inspector-section-title';
  title.textContent = '도형';
  const chevron = document.createElement('span');
  chevron.className = 'inspector-section-chevron';
  chevron.textContent = '▾';
  header.append(title, chevron);

  const body = document.createElement('div');
  body.className = 'inspector-section-body';

  let _collapsed = false;
  header.addEventListener('click', () => {
    _collapsed = !_collapsed;
    section.classList.toggle('collapsed', _collapsed);
  });

  section.append(header, body);

  // 크기 행 (W/H)
  const sizeRow = document.createElement('div');
  sizeRow.className = 'prop-row-2';

  let _batchActive = false;

  const wField = createNumberField({
    label: 'W', step: 1, min: 1, max: 9999, unit: '',
    defaultValue: 100,
    onBegin()   { if (_batchActive) return; _batchActive = true; store.begin('도형 크기'); },
    onChange(v) { if (!_batchActive) return; _applyShape({ w: v }); },
    onCommit()  { _batchActive = false; store.commit(); },
    onCancel()  { _batchActive = false; store.cancel(); },
  });
  const hField = createNumberField({
    label: 'H', step: 1, min: 1, max: 9999, unit: '',
    defaultValue: 100,
    onBegin()   { if (_batchActive) return; _batchActive = true; store.begin('도형 크기'); },
    onChange(v) { if (!_batchActive) return; _applyShape({ h: v }); },
    onCommit()  { _batchActive = false; store.commit(); },
    onCancel()  { _batchActive = false; store.cancel(); },
  });
  sizeRow.append(wField.el, hField.el);

  // 채우기 색
  const fillRow = document.createElement('div');
  fillRow.className = 'prop-row';
  const fillLabel = document.createElement('label');
  fillLabel.className = 'num-label';
  fillLabel.textContent = '채우기';
  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.className = 'color-input';
  fillInput.title = '채우기 색';
  fillRow.append(fillLabel, fillInput);

  fillInput.addEventListener('input', () => {
    const ids = editorState.get().selection;
    if (!ids.length) return;
    _applyShapeDirect({ fill: fillInput.value });
  });

  body.append(sizeRow, fillRow);

  function _applyShape(shapeProps) {
    const ids = editorState.get().selection;
    if (!ids.length) return;
    const doc = store.get();
    const cmds = ids
      .filter(id => doc.layers[id]?.type === 'shape')
      .map(id => ({
        type: 'setLayer', id,
        patch: { shape: { ...doc.layers[id].shape, ...shapeProps } },
      }));
    if (!cmds.length) return;
    store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  function _applyShapeDirect(shapeProps) {
    const ids = editorState.get().selection;
    if (!ids.length) return;
    const doc  = store.get();
    const cmds = ids
      .filter(id => doc.layers[id]?.type === 'shape')
      .map(id => ({
        type: 'setLayer', id,
        patch: { shape: { ...doc.layers[id].shape, ...shapeProps } },
      }));
    if (!cmds.length) return;
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  function _refresh() {
    if (_batchActive) return;
    const ids = editorState.get().selection;
    const doc = store.get();
    const layers = ids.map(id => doc.layers[id]).filter(l => l?.type === 'shape');
    section.style.display = layers.length ? '' : 'none';
    if (!layers.length) return;
    const sh = layers[0].shape ?? {};
    wField.setValue(sh.w ?? 100);
    hField.setValue(sh.h ?? 100);
    if (sh.fill) fillInput.value = sh.fill;
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batchActive) _refresh(); });
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
