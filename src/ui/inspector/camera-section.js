// 카메라 섹션(F2-6) — 화면 전체 X·Y·줌 키프레임.
// 카메라는 레이어가 아니라 doc.camera. setCameraProp 명령으로 값·키프레임을 다룬다.
// 타임라인 카메라 행을 누르면(editorState.cameraActive) 또는 키가 있으면 표시.
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { evalProp } from '../../core/anim/prop.js';
import { cameraHasKeys } from '../timeline/rows.js';

const PROPS = [
  { key: 'x',    label: 'X',  min: -9999, max: 9999, step: 1,    def: 0,   mul: 1 },
  { key: 'y',    label: 'Y',  min: -9999, max: 9999, step: 1,    def: 0,   mul: 1 },
  { key: 'zoom', label: '줌', min: 10,    max: 1000, step: 1,    def: 100, mul: 100 }, // 표시 %, 저장 배율
];

export function createCameraSection(store, editorState) {
  const { section, body } = makeSectionShell('카메라', false);
  let _batch = false;

  const fields = {}; const diamonds = {};

  for (const pd of PROPS) {
    const f = createNumberField({
      label: pd.label, min: pd.min, max: pd.max, step: pd.step, unit: pd.key === 'zoom' ? '%' : '',
      defaultValue: pd.def,
      onBegin() { if (_batch) return; _batch = true; store.begin('카메라'); },
      onChange(v) { if (_batch) _set(pd.key, v / (pd.mul ?? 1)); },
      onCommit() { _batch = false; store.commit(); },
      onCancel() { _batch = false; store.cancel(); },
    });
    fields[pd.key] = f;
    const row = document.createElement('div'); row.className = 'prop-row';
    row.appendChild(f.el);
    // 키프레임 마름모
    const dia = document.createElement('button'); dia.className = 'kf-diamond';
    dia.title = '현재 프레임 키프레임';
    dia.addEventListener('click', (e) => { e.stopPropagation(); _toggleKey(pd.key); });
    f.el.appendChild(dia);
    diamonds[pd.key] = dia;
    body.appendChild(row);
  }

  function _set(key, value) {
    const es = editorState.get();
    store.preview({ type: 'setCameraProp', prop: key, value, ...(es.autoKey ? { f: es.f } : {}) });
  }
  function _toggleKey(key) {
    const es = editorState.get(); const doc = store.get();
    const prop = doc.camera?.[key]; if (!prop) return;
    const has = (prop.keys ?? []).some(k => k.f === es.f);
    if (has) store.apply({ type: 'removeCameraKey', prop: key, f: es.f });
    else store.apply({ type: 'setCameraProp', prop: key, value: evalProp(prop, es.f), f: es.f });
  }

  function _refresh() {
    if (_batch) return;
    const es = editorState.get();
    const doc = store.get();
    const show = es.cameraActive || cameraHasKeys(doc);
    section.style.display = show ? '' : 'none';
    if (!show) return;
    for (const pd of PROPS) {
      const prop = doc.camera?.[pd.key];
      const v = prop ? evalProp(prop, es.f) : pd.def / (pd.mul ?? 1);
      fields[pd.key].setValue(v * (pd.mul ?? 1));
      const atF = (prop?.keys ?? []).some(k => k.f === es.f);
      const any = (prop?.keys ?? []).length > 0;
      const dia = diamonds[pd.key];
      dia.classList.remove('on', 'other');
      if (atF) dia.classList.add('on'); else if (any) dia.classList.add('other');
    }
  }

  const unsubStore = store.subscribe({ any: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('cameraActive' in p || 'f' in p || 'autoKey' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
