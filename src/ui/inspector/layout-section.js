// 인스펙터 배치 섹션 — X, Y, 크기(배율 + 가로·세로 보정), 회전, 불투명도
// item 10: 키프레임 마름모(현재 f 키 토글)  item 12: 혼합 값 표시·상대 적용
// S5-0: 크기 옆 사슬(비율 고정). 끄면 가로(scaleX)·세로(scaleY) 칸이 따로 뜬다.
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { createKeyToggle } from '../controls/key-toggle.js';
import { buildPropCmd, getStartValue } from '../canvas/edit-prop.js';
import { evalProp } from '../../core/anim/prop.js';
import { evalPosition, isCurvedPath } from '../../core/anim/position.js';
import { makeSectionShell } from './section-shell.js';
import { iconMarkup } from '../icons.js';

// 곡선 경로를 아는 현재값(transform.x/y 는 evalPosition, 나머지는 evalProp).
function _evalAt(layer, path, f, def) {
  if (layer && (path === 'transform.x' || path === 'transform.y')) {
    const p = evalPosition(layer.transform, f);
    return path === 'transform.x' ? p.x : p.y;
  }
  const parts = path.split('.'); let cur = layer;
  for (const k of parts) cur = cur?.[k];
  return cur ? evalProp(cur, f) : def;
}

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

    // item 10: 키프레임 마름모 — 공용 key-toggle 조각(변형은 시계·화살표 없이 마름모만)
    const kt = createKeyToggle({ onDiamond: () => _toggleKey(pd.path) });
    fieldObj.el.appendChild(kt.el);
    diamonds[pd.path] = kt;
  }

  // 크기 행: 배율 + 사슬 토글
  const chainBtn = document.createElement('button');
  chainBtn.className = 'size-chain-btn';
  chainBtn.title = '비율 고정';
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

  // ── 경로(R18-3) — 위치 키가 있을 때 단일 선택에서 보인다 ─────────────────
  const pathWrap = document.createElement('div'); pathWrap.className = 'path-controls'; pathWrap.style.display = 'none';
  const pathRow = document.createElement('div'); pathRow.className = 'prop-row path-row';
  const smoothBtn   = _pbtn('경로 부드럽게', () => _smoothPath());
  const straightBtn = _pbtn('경로 직선으로', () => _straightenHandles());
  const orientBtn   = _pbtn('경로 따라 회전', () => _toggleOrient());
  pathRow.append(smoothBtn, straightBtn, orientBtn);
  const noticeEl = document.createElement('div'); noticeEl.className = 'path-notice'; noticeEl.style.display = 'none';
  const noticeText = document.createElement('span'); noticeText.textContent = '곡선 경로를 쓰려면 X·Y 키가 같은 프레임에 있어야 합니다';
  const matchBtn = _pbtn('맞추기', () => _matchFrames());
  noticeEl.append(noticeText, matchBtn);
  pathWrap.append(pathRow, noticeEl);
  body.append(pathWrap);

  // ── 따라가기(R20-B) + 움직임 번짐(R20-C) — 단일 선택 ─────────────────────
  const followWrap = document.createElement('div'); followWrap.className = 'prop-row follow-row';
  const followLabel = document.createElement('span'); followLabel.className = 'num-label'; followLabel.textContent = '따라가기';
  const followDd = createDropdown({
    ariaLabel: '따라갈 대상',
    options: [{ value: '', label: '(없음)' }],
    value: '',
    onChange(v) {
      const id = _singleId(); if (!id) return;
      store.apply({ type: 'setFollow', id, targetId: v || null, keepPlace: true, f: editorState.get().f });
    },
  });
  followWrap.append(followLabel, followDd.el);

  const blurWrap = document.createElement('label'); blurWrap.className = 'prop-row blur-row';
  const blurChk = document.createElement('input'); blurChk.type = 'checkbox'; blurChk.className = 'blur-check';
  const blurText = document.createElement('span'); blurText.textContent = '움직임 번짐';
  blurChk.addEventListener('change', () => {
    const id = _singleId(); if (!id) return;
    store.apply({ type: 'setLayer', id, patch: { motionBlur: blurChk.checked } });
  });
  blurWrap.append(blurChk, blurText);
  body.append(followWrap, blurWrap);

  function _refreshFollowBlur() {
    const id = _singleId();
    const l = id ? store.get().layers[id] : null;
    const isLeaf = l && ['image', 'anim', 'text', 'shape'].includes(l.type);
    followWrap.style.display = l ? '' : 'none';
    blurWrap.style.display = isLeaf ? '' : 'none';
    if (!l) return;
    // 같은 그룹(같은 parentId)·자기 아님·나를 따라가지 않는(순환) 레이어만 후보
    const doc = store.get();
    const pid = l.parentId ?? null;
    const opts = [{ value: '', label: '(없음)' }];
    for (const [cid, c] of Object.entries(doc.layers)) {
      if (cid === id || (c.parentId ?? null) !== pid) continue;
      if (_wouldCycle(doc, cid, id)) continue;
      opts.push({ value: cid, label: c.name ?? cid });
    }
    followDd.setOptions(opts);
    followDd.setValue(l.followId ?? '');
    if (isLeaf) blurChk.checked = !!l.motionBlur;
  }
  function _wouldCycle(doc, startId, id) {
    let cur = startId; const seen = new Set();
    while (cur && !seen.has(cur)) { if (cur === id) return true; seen.add(cur); cur = doc.layers[cur]?.followId ?? null; }
    return false;
  }

  function _pbtn(label, fn) {
    const b = document.createElement('button'); b.className = 'quiet sm'; b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function _singleId() {
    const sel = editorState.get().selection;
    if (sel.length !== 1) return null;
    return store.get().layers[sel[0]] ? sel[0] : null;
  }
  function _framesMatch(xk, yk) {
    if (!xk?.length || !yk?.length || xk.length !== yk.length) return false;
    for (let i = 0; i < xk.length; i++) if (xk[i].f !== yk[i].f) return false;
    return true;
  }
  function _smoothPath() {
    const id = _singleId(); if (!id) return;
    const l = store.get().layers[id];
    const xk = l.transform.x.keys ?? [], yk = l.transform.y.keys ?? [];
    if (!_framesMatch(xk, yk) || xk.length < 2) return;
    const P = xk.map((k, i) => ({ x: k.v, y: yk[i].v, f: k.f }));
    const cmds = [];
    for (let i = 0; i < P.length; i++) {
      let ox = 0, oy = 0, ix = 0, iy = 0;
      if (i > 0 && i < P.length - 1) {
        const dx = P[i + 1].x - P[i - 1].x, dy = P[i + 1].y - P[i - 1].y;
        const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
        const dN = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y) / 3;
        const dP = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y) / 3;
        ox = ux * dN; oy = uy * dN; ix = -ux * dP; iy = -uy * dP;
      } else if (i === 0) { ox = (P[1].x - P[0].x) / 3; oy = (P[1].y - P[0].y) / 3; }
      else { const j = P.length - 1; ix = (P[j - 1].x - P[j].x) / 3; iy = (P[j - 1].y - P[j].y) / 3; }
      cmds.push({ type: 'setKeyHandle', id, f: P[i].f, sp: { ix, iy, ox, oy } });
    }
    if (cmds.length) store.apply({ type: 'batch', cmds });
  }
  function _straightenHandles() {
    const id = _singleId(); if (!id) return;
    const xk = store.get().layers[id].transform.x.keys ?? [];
    const cmds = xk.filter((k) => k.sp).map((k) => ({ type: 'setKeyHandle', id, f: k.f, sp: null }));
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _toggleOrient() {
    const id = _singleId(); if (!id) return;
    store.apply({ type: 'setLayer', id, patch: { autoOrient: !store.get().layers[id].autoOrient } });
  }
  function _matchFrames() {
    const id = _singleId(); if (!id) return;
    const l = store.get().layers[id];
    const xk = l.transform.x.keys ?? [], yk = l.transform.y.keys ?? [];
    const xs = new Set(xk.map((k) => k.f)), ys = new Set(yk.map((k) => k.f));
    const all = [...new Set([...xs, ...ys])].sort((a, b) => a - b);
    const cmds = [];
    for (const f of all) {
      if (!xs.has(f)) cmds.push({ type: 'setProp', id, path: 'transform.x', value: evalProp(l.transform.x, f), f });
      if (!ys.has(f)) cmds.push({ type: 'setProp', id, path: 'transform.y', value: evalProp(l.transform.y, f), f });
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _refreshPath() {
    const id = _singleId();
    const l = id ? store.get().layers[id] : null;
    const xk = l?.transform?.x?.keys ?? [], yk = l?.transform?.y?.keys ?? [];
    const hasPath = !!l && (xk.length >= 2 || yk.length >= 2);
    pathWrap.style.display = hasPath ? '' : 'none';
    if (!hasPath) return;
    const matched = _framesMatch(xk, yk) && xk.length >= 2;
    orientBtn.classList.toggle('is-on', !!l.autoOrient);
    smoothBtn.disabled = !matched;
    noticeEl.style.display = matched ? 'none' : '';
  }

  function _captureVals(path) {
    const es  = editorState.get();
    const doc = store.get();
    const m = {};
    for (const id of es.selection) {
      m[id] = _evalAt(doc.layers[id], path, es.f, path.includes('scale') ? 1 : 0);
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
    _refreshPath();
    _refreshFollowBlur();
    const es  = editorState.get();
    const ids = es.selection;
    if (!ids.length) return;
    const doc = store.get();
    const f   = es.f;

    for (const pd of _PROPS) {
      const vals = ids.map(id => _evalAt(doc.layers[id], pd.path, f, pd.def / (pd.mul ?? 1)));
      const mul = pd.mul ?? 1;
      const allEqual = vals.every(v => Math.abs(v - vals[0]) < 1e-6);
      if (allEqual) fields[pd.path].setValue(vals[0] * mul);
      else          fields[pd.path].setMixed(vals[0] * mul);

      // 마름모 상태
      const atF = ids.map(id => (_getProp(doc.layers[id], pd.path)?.keys ?? []).some(k => k.f === f));
      const any = ids.some(id => (_getProp(doc.layers[id], pd.path)?.keys ?? []).length > 0);
      let d = '';
      if (atF.length && atF.every(Boolean)) d = 'on';
      else if (any) d = 'other';
      diamonds[pd.path].update({ diamond: d });
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
