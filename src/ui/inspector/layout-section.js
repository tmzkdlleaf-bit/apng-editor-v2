// 인스펙터 배치 섹션 — X, Y, 크기, 회전, 불투명도
// item 10: 키프레임 마름모(현재 f 키 토글)  item 12: 혼합 값 표시·상대 적용
import { createNumberField } from '../controls/number-field.js';
import { buildPropCmd, getStartValue } from '../canvas/edit-prop.js';
import { evalProp } from '../../core/anim/prop.js';
import { makeSectionShell } from './section-shell.js';

const _PROPS = [
  { path: 'transform.x',        label: 'X',        step: 1,    min: -9999, max: 9999, unit: '',  def: 0 },
  { path: 'transform.y',        label: 'Y',        step: 1,    min: -9999, max: 9999, unit: '',  def: 0 },
  { path: 'transform.scale',    label: '배율',     step: 0.01, min: 0.01,  max: 99,   unit: '',  def: 1 },
  { path: 'transform.rotation', label: '회전',     step: 1,    min: -360,  max: 360,  unit: '°', def: 0 },
  { path: 'transform.alpha',    label: '불투명도', step: 0.01, min: 0,     max: 1,    unit: '',  def: 1 },
];

function _getProp(layer, path) {
  const parts = path.split('.');
  let cur = layer;
  for (const p of parts) cur = cur?.[p];
  return cur ?? null;
}

export function createLayoutSection(store, editorState) {
  const { section, body } = makeSectionShell('배치', false);

  const row1 = document.createElement('div'); row1.className = 'prop-row-2';
  const row2 = document.createElement('div'); row2.className = 'prop-row-2';
  const row3 = document.createElement('div'); row3.className = 'prop-row';

  const fields   = {};
  const diamonds = {};
  let _batchActive = false;
  let _origVals = null; // 드래그 중 각 레이어 시작값

  for (const pd of _PROPS) {
    const fieldObj = createNumberField({
      label: pd.label, step: pd.step, min: pd.min, max: pd.max, unit: pd.unit,
      defaultValue: pd.def,
      onBegin() {
        if (_batchActive) return;
        _batchActive = true;
        _origVals = _captureVals(pd.path);
        store.begin('레이아웃');
      },
      onChange(v, info) {
        if (!_batchActive) return;
        const es  = editorState.get();
        const ids = es.selection;
        if (!ids.length) return;
        const doc = store.get();
        const cmds = [];
        for (const id of ids) {
          if (!doc.layers[id]) continue;
          const base = _origVals?.[id] ?? 0;
          const target = info?.relative ? base + info.delta : v;
          cmds.push(buildPropCmd(doc, id, pd.path, target, es.f, es.autoKey));
        }
        if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      },
      onCommit() { _batchActive = false; _origVals = null; store.commit(); },
      onCancel() { _batchActive = false; _origVals = null; store.cancel(); },
    });
    fields[pd.path] = fieldObj;

    // item 10: 키프레임 마름모
    const dia = document.createElement('button');
    dia.className = 'kf-diamond';
    dia.title = '현재 프레임 키프레임';
    dia.addEventListener('click', (e) => { e.stopPropagation(); _toggleKey(pd.path); });
    fieldObj.el.appendChild(dia);
    diamonds[pd.path] = dia;
  }

  row1.append(fields['transform.x'].el, fields['transform.y'].el);
  row2.append(fields['transform.scale'].el, fields['transform.rotation'].el);
  row3.append(fields['transform.alpha'].el);
  body.append(row1, row2, row3);

  function _captureVals(path) {
    const es  = editorState.get();
    const doc = store.get();
    const m = {};
    for (const id of es.selection) {
      const prop = _getProp(doc.layers[id], path);
      m[id] = prop ? evalProp(prop, es.f) : 0;
    }
    return m;
  }

  // 현재 f 키 토글 — 선택 전체에 1건
  function _toggleKey(path) {
    const es  = editorState.get();
    const doc = store.get();
    const ids = es.selection.filter(id => doc.layers[id]);
    if (!ids.length) return;
    const f = es.f;
    const allAtF = ids.every(id => (_getProp(doc.layers[id], path)?.keys ?? []).some(k => k.f === f));

    const cmds = [];
    for (const id of ids) {
      const prop = _getProp(doc.layers[id], path);
      if (!prop) continue;
      const hasAtF = (prop.keys ?? []).some(k => k.f === f);
      if (allAtF) {
        if (hasAtF) cmds.push({ type: 'removeKey', id, path, f });
      } else {
        if (!hasAtF) cmds.push({ type: 'setProp', id, path, value: evalProp(prop, f), f });
      }
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  function _refresh() {
    if (_batchActive) return;
    const es  = editorState.get();
    const ids = es.selection;
    if (!ids.length) return;
    const doc = store.get();
    const f   = es.f;

    for (const pd of _PROPS) {
      const vals = ids.map(id => {
        const prop = _getProp(doc.layers[id], pd.path);
        return prop ? evalProp(prop, f) : pd.def;
      });
      const allEqual = vals.every(v => Math.abs(v - vals[0]) < 1e-6);
      if (allEqual) fields[pd.path].setValue(vals[0]);
      else          fields[pd.path].setMixed(vals[0]);

      // 마름모 상태
      const atF = ids.map(id => (_getProp(doc.layers[id], pd.path)?.keys ?? []).some(k => k.f === f));
      const any = ids.some(id => (_getProp(doc.layers[id], pd.path)?.keys ?? []).length > 0);
      const dia = diamonds[pd.path];
      dia.classList.remove('on', 'other');
      if (atF.every(Boolean)) dia.classList.add('on');
      else if (any) dia.classList.add('other');
    }
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batchActive) _refresh(); });
  const unsubES    = editorState.subscribe((p) => {
    if ('selection' in p || 'f' in p) _refresh();
  });

  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
