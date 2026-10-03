// 인스펙터 텍스트 섹션 — 내용, 크기, 색상
import { createNumberField } from '../controls/number-field.js';

export function createTextSection(store, editorState) {
  const section = document.createElement('div');
  section.className = 'inspector-section';

  const header = document.createElement('div');
  header.className = 'inspector-section-header';
  const title   = document.createElement('span');
  title.className = 'inspector-section-title';
  title.textContent = '텍스트';
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

  // 텍스트 내용 (textarea)
  const contentRow = document.createElement('div');
  contentRow.className = 'prop-row';
  const textarea = document.createElement('textarea');
  textarea.className = 'text-input-area';
  textarea.rows = 3;
  textarea.style.cssText = 'width:100%; resize:vertical; font:inherit; background:var(--bg2); color:var(--fg); border:1px solid var(--line2); padding:4px; font-size:12px; box-sizing:border-box;';
  contentRow.appendChild(textarea);

  let _textTimer = null;
  textarea.addEventListener('input', () => {
    clearTimeout(_textTimer);
    _textTimer = setTimeout(() => {
      const ids = editorState.get().selection;
      if (!ids.length) return;
      const cmds = ids
        .filter(id => store.get().layers[id]?.type === 'text')
        .map(id => ({ type: 'setLayer', id, patch: { text: textarea.value } }));
      if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    }, 200);
  });

  // 크기 / 색상 행
  const sizeRow = document.createElement('div');
  sizeRow.className = 'prop-row-2';

  let _batchActive = false;
  const sizeField = createNumberField({
    label: '크기', step: 1, min: 1, max: 999, unit: '',
    defaultValue: 48,
    onBegin()   { if (_batchActive) return; _batchActive = true; store.begin('글자 크기'); },
    onChange(v) {
      if (!_batchActive) return;
      const ids  = editorState.get().selection;
      const doc  = store.get();
      const cmds = ids
        .filter(id => doc.layers[id]?.type === 'text')
        .map(id => ({ type: 'setLayer', id, patch: { size: v } }));
      if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    },
    onCommit()  { _batchActive = false; store.commit(); },
    onCancel()  { _batchActive = false; store.cancel(); },
  });

  const colorRow = document.createElement('div');
  colorRow.className = 'prop-row';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'num-label';
  colorLabel.textContent = '색상';
  const colorInput = document.createElement('input');
  colorInput.type  = 'color';
  colorInput.className = 'color-input';
  colorRow.append(colorLabel, colorInput);

  colorInput.addEventListener('input', () => {
    const ids = editorState.get().selection;
    if (!ids.length) return;
    const doc  = store.get();
    const cmds = ids
      .filter(id => doc.layers[id]?.type === 'text')
      .map(id => ({ type: 'setLayer', id, patch: { color: colorInput.value } }));
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  });

  sizeRow.append(sizeField.el);
  body.append(contentRow, sizeRow, colorRow);

  function _refresh() {
    if (_batchActive) return;
    const ids   = editorState.get().selection;
    const doc   = store.get();
    const layers = ids.map(id => doc.layers[id]).filter(l => l?.type === 'text');
    section.style.display = layers.length ? '' : 'none';
    if (!layers.length) return;
    const layer = layers[0];
    textarea.value = layer.text ?? '';
    sizeField.setValue(layer.size ?? 48);
    if (layer.color) colorInput.value = layer.color;
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batchActive) _refresh(); });
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); clearTimeout(_textTimer); }
  return { el: section, destroy };
}
