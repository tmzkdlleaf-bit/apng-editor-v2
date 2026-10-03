// 인스펙터 레이어 섹션 — 블렌드 모드, 불투명도, 가시성, 잠금
import { createNumberField } from '../controls/number-field.js';

const _BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

const _BLEND_KO = {
  'normal': '보통', 'multiply': '곱하기', 'screen': '스크린',
  'overlay': '오버레이', 'darken': '어둡게', 'lighten': '밝게',
  'color-dodge': '닷지', 'color-burn': '번', 'hard-light': '강한 빛',
  'soft-light': '부드러운 빛', 'difference': '차이', 'exclusion': '제외',
  'hue': '색조', 'saturation': '채도', 'color': '색상', 'luminosity': '광도',
};

export function createLayerSection(store, editorState) {
  const section = document.createElement('div');
  section.className = 'inspector-section';

  const header = document.createElement('div');
  header.className = 'inspector-section-header';
  const title   = document.createElement('span');
  title.className = 'inspector-section-title';
  title.textContent = '레이어';
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

  // 블렌드 모드 선택
  const blendRow = document.createElement('div');
  blendRow.className = 'prop-row';
  const blendLabel = document.createElement('label');
  blendLabel.className = 'num-label';
  blendLabel.textContent = '블렌드';
  const blendSel = document.createElement('select');
  blendSel.className = 'blend-select';
  for (const m of _BLEND_MODES) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = _BLEND_KO[m] ?? m;
    blendSel.appendChild(opt);
  }
  blendRow.append(blendLabel, blendSel);

  blendSel.addEventListener('change', () => {
    const ids = editorState.get().selection;
    if (!ids.length) return;
    const cmds = ids.map(id => ({ type: 'setLayer', id, patch: { blend: blendSel.value } }));
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  });

  // 불투명도 (layer.opacity, 0-100%)
  let _batchActive = false;
  const opacityField = createNumberField({
    label: '불투명도',
    step: 1,
    min: 0,
    max: 100,
    unit: '%',
    defaultValue: 100,
    onBegin() {
      if (_batchActive) return;
      _batchActive = true;
      store.begin('불투명도');
    },
    onChange(v) {
      if (!_batchActive) return;
      const ids = editorState.get().selection;
      if (!ids.length) return;
      const opacity = Math.round(v) / 100;
      const cmds = ids.map(id => ({ type: 'setLayer', id, patch: { opacity } }));
      store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    },
    onCommit() { _batchActive = false; store.commit(); },
    onCancel() { _batchActive = false; store.cancel(); },
  });

  body.append(blendRow, opacityField.el);

  function _refresh() {
    const ids = editorState.get().selection;
    if (!ids.length) return;
    if (_batchActive) return;
    const doc   = store.get();
    const layer = doc.layers[ids[0]];
    if (!layer) return;
    blendSel.value = layer.blend ?? 'normal';
    opacityField.setValue(Math.round((layer.opacity ?? 1) * 100));
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batchActive) _refresh(); });
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });

  _refresh();

  function destroy() { unsubStore(); unsubES(); }

  return { el: section, destroy };
}
