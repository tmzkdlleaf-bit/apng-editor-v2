// 인스펙터 배치 섹션 — X, Y, 크기(배율 + 가로·세로 보정), 회전, 불투명도
// item 10: 키프레임 마름모(현재 f 키 토글)  item 12: 혼합 값 표시·상대 적용
// S5-0: 크기 옆 사슬(비율 고정). 끄면 가로(scaleX)·세로(scaleY) 칸이 따로 뜬다.
import { createNumberField } from '../controls/number-field.js';
import { buildPropCmd, getStartValue } from '../canvas/edit-prop.js';
import { evalProp } from '../../core/anim/prop.js';
import { makeSectionShell } from './section-shell.js';
import { iconMarkup } from '../icons.js';

// mul = 표시 배수(저장은 raw). 배율·투명도는 0–100%로 보이되 저장은 0–1(마이그레이션 없음).
const _PROPS = [
  { path: 'transform.x',        label: 'X',           step: 1, min: -9999, max: 9999, unit: '',  def: 0,   mul: 1 },
  { path: 'transform.y',        label: 'Y',           step: 1, min: -9999, max: 9999, unit: '',  def: 0,   mul: 1 },
  { path: 'transform.scale',    label: '크기',        step: 1, min: 1,      max: 9900, unit: '%', def: 100, mul: 100 },
  { path: 'transform.scaleX',   label: '가로',        step: 1, min: 1,      max: 9900, unit: '%', def: 100, mul: 100, ratioOnly: true },
  { path: 'transform.scaleY',   label: '세로',        step: 1, min: 1,      max: 9900, unit: '%', def: 100, mul: 100, ratioOnly: true },
  { path: 'transform.rotation', label: '회전',        step: 1, min: -360,   max: 360,  unit: '°', def: 0,   mul: 1 },
  { path: 'transform.alpha',    label: '투명도(움직임)', step: 1, min: 0,   max: 100,  unit: '%', def: 100, mul: 100 },
];

function _getProp(layer, path) {
  const parts = path.split('.');
  let cur = layer;
  for (const p of parts) cur = cur?.[p];
  return cur ?? null;
}

export function createLayoutSection(store, editorState) {
  const { section, body } = makeSectionShell('배치', false);

  let _ratioLock = true; // 비율 고정(기본). 끄면 가로·세로 보정 칸이 보인다.

  const row1 = document.createElement('div'); row1.className = 'prop-row-2';
  const rowScale = document.createElement('div'); rowScale.className = 'prop-row';     // 크기 + 사슬
  const rowWH = document.createElement('div'); rowWH.className = 'prop-row-2';          // 가로·세로
  const row2 = document.createElement('div'); row2.className = 'prop-row';             // 회전
  const row3 = document.createElement('div'); row3.className = 'prop-row';             // 투명도

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
        const mul = pd.mul ?? 1;
        const cmds = [];
        for (const id of ids) {
          if (!doc.layers[id]) continue;
          const base = _origVals?.[id] ?? 0;               // 저장 단위
          const target = info?.relative ? base + (info.delta / mul) : (v / mul);
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

  // 크기 행: 배율 + 사슬 토글
  const chainBtn = document.createElement('button');
  chainBtn.className = 'size-chain-btn';
  chainBtn.title = '비율 고정 (끄면 가로·세로 따로)';
  chainBtn.setAttribute('aria-label', '비율 고정');
  function _syncChain() {
    chainBtn.classList.toggle('is-on', _ratioLock);
    chainBtn.innerHTML = iconMarkup(_ratioLock ? 'chain' : 'chain-off', { size: 14 });
    rowWH.style.display = _ratioLock ? 'none' : '';
  }
  chainBtn.addEventListener('click', () => { _ratioLock = !_ratioLock; _syncChain(); });
  rowScale.append(fields['transform.scale'].el, chainBtn);

  row1.append(fields['transform.x'].el, fields['transform.y'].el);
  rowWH.append(fields['transform.scaleX'].el, fields['transform.scaleY'].el);
  row2.append(fields['transform.rotation'].el);
  row3.append(fields['transform.alpha'].el);
  body.append(row1, rowScale, rowWH, row2, row3);
  _syncChain();

  function _captureVals(path) {
    const es  = editorState.get();
    const doc = store.get();
    const m = {};
    for (const id of es.selection) {
      const prop = _getProp(doc.layers[id], path);
      m[id] = prop ? evalProp(prop, es.f) : (path.includes('scale') ? 1 : 0);
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
        return prop ? evalProp(prop, f) : (pd.def / (pd.mul ?? 1));
      });
      const mul = pd.mul ?? 1;
      const allEqual = vals.every(v => Math.abs(v - vals[0]) < 1e-6);
      if (allEqual) fields[pd.path].setValue(vals[0] * mul);
      else          fields[pd.path].setMixed(vals[0] * mul);

      // 마름모 상태
      const atF = ids.map(id => (_getProp(doc.layers[id], pd.path)?.keys ?? []).some(k => k.f === f));
      const any = ids.some(id => (_getProp(doc.layers[id], pd.path)?.keys ?? []).length > 0);
      const dia = diamonds[pd.path];
      dia.classList.remove('on', 'other');
      if (atF.every(Boolean)) dia.classList.add('on');
      else if (any) dia.classList.add('other');
    }
    // 가로·세로가 1이 아니면 자동으로 사슬을 풀어 칸을 보인다.
    const stretched = ids.some(id => {
      const l = doc.layers[id];
      return Math.abs(evalProp(_getProp(l, 'transform.scaleX') ?? { value: 1 }, f) - 1) > 1e-6
          || Math.abs(evalProp(_getProp(l, 'transform.scaleY') ?? { value: 1 }, f) - 1) > 1e-6;
    });
    if (stretched && _ratioLock) { _ratioLock = false; _syncChain(); }
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batchActive) _refresh(); });
  const unsubES    = editorState.subscribe((p) => {
    if ('selection' in p || 'f' in p) _refresh();
  });

  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
