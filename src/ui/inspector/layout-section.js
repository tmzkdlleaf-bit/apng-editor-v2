// 인스펙터 레이아웃 섹션 — X, Y, Scale, Rotation, Alpha
import { createNumberField } from '../controls/number-field.js';

const _PROPS = [
  { path: 'transform.x',        label: 'X',    step: 1,    min: -9999,  max: 9999, unit: '' },
  { path: 'transform.y',        label: 'Y',    step: 1,    min: -9999,  max: 9999, unit: '' },
  { path: 'transform.scale',    label: '배율', step: 0.01, min: 0.01,   max: 99,   unit: '' },
  { path: 'transform.rotation', label: '회전', step: 1,    min: -360,   max: 360,  unit: '°' },
  { path: 'transform.alpha',    label: '불투명도', step: 0.01, min: 0, max: 1, unit: '' },
];

function _getPropValue(layer, propPath) {
  const parts = propPath.split('.');
  let cur = layer;
  for (const p of parts) { cur = cur?.[p]; }
  return cur?.value ?? 0;
}

export function createLayoutSection(store, editorState) {
  const section = document.createElement('div');
  section.className = 'inspector-section';

  const header = document.createElement('div');
  header.className = 'inspector-section-header';
  const title   = document.createElement('span');
  title.className = 'inspector-section-title';
  title.textContent = '배치';
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

  // 두 칸씩 나란히 배치 (X/Y, Scale/Rotation)
  const row1 = document.createElement('div');
  row1.className = 'prop-row-2';
  const row2 = document.createElement('div');
  row2.className = 'prop-row-2';
  const row3 = document.createElement('div');
  row3.className = 'prop-row';

  const fields = {};
  let _batchActive = false;

  for (const pd of _PROPS) {
    const fieldObj = createNumberField({
      label:        pd.label,
      step:         pd.step,
      min:          pd.min,
      max:          pd.max,
      unit:         pd.unit,
      defaultValue: pd.path.includes('scale') ? 1 : pd.path.includes('alpha') ? 1 : 0,
      onBegin() {
        if (_batchActive) return;
        _batchActive = true;
        store.begin('레이아웃');
      },
      onChange(v) {
        if (!_batchActive) return;
        const ids = editorState.get().selection;
        if (!ids.length) return;
        const cmds = ids.map(id => ({
          type: 'setProp', id,
          path: pd.path.replace('transform.', 'transform.'),
          value: v,
        }));
        store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      },
      onCommit() {
        _batchActive = false;
        store.commit();
      },
      onCancel() {
        _batchActive = false;
        store.cancel();
      },
    });
    fields[pd.path] = fieldObj;
  }

  row1.append(fields['transform.x'].el, fields['transform.y'].el);
  row2.append(fields['transform.scale'].el, fields['transform.rotation'].el);
  row3.append(fields['transform.alpha'].el);
  body.append(row1, row2, row3);

  function _refresh() {
    const ids = editorState.get().selection;
    if (!ids.length) return;

    const doc = store.get();
    if (ids.length === 1) {
      const layer = doc.layers[ids[0]];
      if (!layer) return;
      for (const pd of _PROPS) {
        fields[pd.path].setValue(_getPropValue(layer, pd.path));
      }
    } else {
      // 다중 선택: 혼합 값 — 첫 번째 레이어 기준
      const layer = doc.layers[ids[0]];
      if (!layer) return;
      for (const pd of _PROPS) {
        fields[pd.path].setValue(_getPropValue(layer, pd.path));
      }
    }
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batchActive) _refresh(); });
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });

  _refresh();

  function destroy() { unsubStore(); unsubES(); }

  return { el: section, destroy };
}
