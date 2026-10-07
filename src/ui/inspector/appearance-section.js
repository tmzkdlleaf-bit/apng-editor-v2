// 인스펙터 모습 섹션 — 블렌드·불투명도 + (도형) 크기·채우기 + (글자) 내용·크기·색
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
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
  const blend = createDropdown({
    ariaLabel: '블렌드 모드',
    options: _BLEND.map(([value, label]) => ({ value, label })),
    value: 'normal',
    onChange(v) {
      const ids = editorState.get().selection;
      const cmds = ids.map(id => ({ type: 'setLayer', id, patch: { blend: v } }));
      if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    },
  });
  blendRow.append(blendLabel, blend.el);

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

  // 도형·글자 세부 속성은 전용 섹션(shape-section.js / text-section.js)이 담당한다.
  // 여기(모습)는 공통 속성(블렌드·불투명도)만.

  function _refresh() {
    if (_opBatch) return;
    const ids = editorState.get().selection;
    const doc = store.get();
    if (!ids.length) return;
    const first = doc.layers[ids[0]];
    if (!first) return;

    blend.setValue(first.blend ?? 'normal');
    opacityField.setValue(Math.round((first.opacity ?? 1) * 100));
  }

  const unsubStore = store.subscribe({ layers: true }, () => _refresh());
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); blend.destroy(); }
  return { el: section, destroy };
}
