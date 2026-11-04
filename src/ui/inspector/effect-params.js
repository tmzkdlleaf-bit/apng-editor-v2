// 효과 파라미터 컨트롤 공용 조각(R17b) — 효과 레이어(effect-section)와 레이어 효과 쌓기(fx-stack-section)가 함께 쓴다.
// R23 에서 "효과 컨트롤" 패널로 옮길 조각이다.
//
// createEffectParams(store, editorState, {
//   effectDef,               // 효과 정의({ params, ... })
//   targets,                 // () => [{ id, fxId }]  (fxId 없으면 효과 레이어 자신)
// }) → { el, refresh, destroy }
//
// 값 바꾸기 규칙(R16-4 동일):
//   키 있으면 현재 프레임 setProp, 자동 키(editorState.autoKey)면 setParamAnim on, 아니면 정적 params.
import { createSliderField } from '../controls/slider-field.js';
import { createNumberField } from '../controls/number-field.js';
import { createColorField } from '../controls/color-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { createKeyToggle } from '../controls/key-toggle.js';
import { evalProp } from '../../core/anim/prop.js';

export function createEffectParams(store, editorState, { effectDef, targets }) {
  const el = document.createElement('div');
  el.className = 'effect-params';
  const controls = [];
  const keyToggles = {}; // key -> { kt, pd, sync }
  let dragging = false;

  const _holder = (t) => { const l = store.get().layers[t.id]; return t.fxId ? l?.fx?.[t.fxId] : l; };
  const _animPath = (t, key) => (t.fxId ? `fx.${t.fxId}.paramAnim.${key}` : `paramAnim.${key}`);

  function _curVal(t, pd, f) {
    const h = _holder(t);
    const a = h?.paramAnim?.[pd.key];
    if (a?.keys?.length) return evalProp(a, f);
    const v = (h?.params ?? {})[pd.key];
    return v !== undefined ? v : pd.default;
  }

  function _setStaticCmd(t, key, value) {
    const l = store.get().layers[t.id];
    if (t.fxId) {
      const fx = l.fx[t.fxId];
      return { type: 'setFx', id: t.id, fxId: t.fxId, patch: { params: { ...(fx.params ?? {}), [key]: value } } };
    }
    return { type: 'setLayer', id: t.id, patch: { params: { ...(l.params ?? {}), [key]: value } } };
  }

  function _applyParam(pd, value, preview) {
    const es = editorState.get();
    const f = es.f;
    const cmds = [];
    for (const t of targets()) {
      const h = _holder(t);
      if (!h) continue;
      const hasKeys = !!h.paramAnim?.[pd.key]?.keys?.length;
      if (hasKeys) cmds.push({ type: 'setProp', id: t.id, path: _animPath(t, pd.key), value, f });
      else if (es.autoKey) cmds.push({ type: 'setParamAnim', id: t.id, fxId: t.fxId, key: pd.key, on: true, f, v: value });
      else cmds.push(_setStaticCmd(t, pd.key, value));
    }
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  function _clockState(pd) {
    const list = targets();
    let on = 0, total = 0;
    for (const t of list) { const h = _holder(t); if (!h) continue; total++; if (h.paramAnim?.[pd.key]?.keys?.length) on++; }
    if (!total) return 'off';
    return on === total ? 'on' : on === 0 ? 'off' : 'mixed';
  }

  function _toggleClock(pd) {
    const f = editorState.get().f;
    const turnOn = _clockState(pd) !== 'on';
    const cmds = [];
    for (const t of targets()) {
      const h = _holder(t); if (!h) continue;
      const keyed = !!h.paramAnim?.[pd.key]?.keys?.length;
      if (turnOn && !keyed) cmds.push({ type: 'setParamAnim', id: t.id, fxId: t.fxId, key: pd.key, on: true, f, v: _curVal(t, pd, f) });
      else if (!turnOn && keyed) cmds.push({ type: 'setParamAnim', id: t.id, fxId: t.fxId, key: pd.key, on: false, f });
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  function _toggleKey(pd) {
    const f = editorState.get().f;
    const list = targets().filter((t) => _holder(t)?.paramAnim?.[pd.key]?.keys?.length);
    if (!list.length) return;
    const allAtF = list.every((t) => (_holder(t).paramAnim[pd.key].keys ?? []).some((k) => k.f === f));
    const cmds = [];
    for (const t of list) {
      const prop = _holder(t).paramAnim[pd.key];
      const hasAtF = (prop.keys ?? []).some((k) => k.f === f);
      const path = _animPath(t, pd.key);
      if (allAtF) { if (hasAtF) cmds.push({ type: 'removeKey', id: t.id, path, f }); }
      else { if (!hasAtF) cmds.push({ type: 'setProp', id: t.id, path, value: evalProp(prop, f), f }); }
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  function _gotoKey(pd, dir) {
    const f = editorState.get().f;
    const frames = new Set();
    for (const t of targets()) for (const k of (_holder(t)?.paramAnim?.[pd.key]?.keys ?? [])) frames.add(k.f);
    const sorted = [...frames].sort((a, b) => a - b);
    if (!sorted.length) return;
    let target = null;
    if (dir < 0) { for (const kf of sorted) if (kf < f) target = kf; }
    else { for (const kf of sorted) if (kf > f) { target = kf; break; } }
    if (target == null) return;
    const fc = store.get().meta.frameCount ?? 1;
    editorState.set({ f: Math.max(0, Math.min(fc - 1, target)) });
  }

  const _drag = {
    begin() { dragging = true; store.begin('파라미터'); },
    commit() { dragging = false; store.commit(); },
    cancel() { dragging = false; store.cancel(); },
  };

  function _registerKeyToggle(pd, row, sync) {
    const kt = createKeyToggle({
      showClock: true, showArrows: true, title: `${pd.label} 키`,
      onClock: () => _toggleClock(pd), onDiamond: () => _toggleKey(pd),
      onPrev: () => _gotoKey(pd, -1), onNext: () => _gotoKey(pd, +1),
    });
    row.insertBefore(kt.el, row.firstChild);
    keyToggles[pd.key] = { kt, pd, sync };
    controls.push(kt);
  }

  function _row(label, ctrl) {
    const r = document.createElement('div'); r.className = 'prop-row';
    const l = document.createElement('label'); l.className = 'num-label'; l.textContent = label;
    r.append(l, ctrl); return r;
  }

  function _makeParamControl(pd) {
    const t0 = targets()[0];
    const f = editorState.get().f;
    const val = _curVal(t0, pd, f);
    if (pd.type === 'bool') {
      const row = document.createElement('div'); row.className = 'prop-row';
      const label = document.createElement('label'); label.className = 'fx-check';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!val;
      const span = document.createElement('span'); span.textContent = pd.label;
      label.append(input, span); row.appendChild(label);
      input.addEventListener('change', () => _applyParam(pd, input.checked));
      _registerKeyToggle(pd, row, null);
      return row;
    }
    if (pd.type === 'color') {
      const cf = createColorField({ value: val || '#ffffff',
        onInput: (hex) => { _drag.begin(); _applyParam(pd, hex, true); },
        onChange: (hex) => { _drag.begin(); _applyParam(pd, hex, true); _drag.commit(); } });
      controls.push(cf);
      const row = _row(pd.label, cf.el);
      _registerKeyToggle(pd, row, (v) => cf.setValue?.(v));
      return row;
    }
    if (pd.type === 'select') {
      const dd = createDropdown({ ariaLabel: pd.label, value: String(val),
        options: (pd.options ?? []).map((o) => ({ value: String(o.value), label: o.label })),
        onChange: (v) => _applyParam(pd, v) });
      controls.push(dd);
      const row = _row(pd.label, dd.el);
      _registerKeyToggle(pd, row, (v) => dd.setValue?.(String(v)));
      return row;
    }
    if (pd.type === 'text') {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'num-input'; inp.value = String(val ?? '');
      inp.setAttribute('aria-label', pd.label);
      inp.addEventListener('change', () => _applyParam(pd, inp.value));
      const row = _row(pd.label, inp);
      _registerKeyToggle(pd, row, (v) => { inp.value = String(v ?? ''); });
      return row;
    }
    if (pd.type === 'coord') {
      const cv = (typeof val === 'object' && val) ? val : { x: 0.5, y: 0.5 };
      const _base = () => { const b = _curVal(targets()[0], pd, editorState.get().f); return (typeof b === 'object' && b) ? b : cv; };
      const fx = createNumberField({ label: 'X', min: -1, max: 2, step: 0.01, defaultValue: 0.5,
        onBegin() { _drag.begin(); }, onChange(v) { _applyParam(pd, { ..._base(), x: v }, true); },
        onCommit() { _drag.commit(); }, onCancel() { _drag.cancel(); } });
      const fy = createNumberField({ label: 'Y', min: -1, max: 2, step: 0.01, defaultValue: 0.5,
        onBegin() { _drag.begin(); }, onChange(v) { _applyParam(pd, { ..._base(), y: v }, true); },
        onCommit() { _drag.commit(); }, onCancel() { _drag.cancel(); } });
      fx.setValue(cv.x ?? 0.5); fy.setValue(cv.y ?? 0.5);
      controls.push(fx, fy);
      const wrap = document.createElement('div'); wrap.className = 'prop-row';
      const label = document.createElement('label'); label.className = 'num-label'; label.textContent = pd.label;
      const grp = document.createElement('div'); grp.className = 'prop-row-2'; grp.style.flex = '1'; grp.append(fx.el, fy.el);
      wrap.append(label, grp);
      _registerKeyToggle(pd, wrap, (v) => { if (v && typeof v === 'object') { fx.setValue(v.x ?? 0.5); fy.setValue(v.y ?? 0.5); } });
      return wrap;
    }
    // int / float → 슬라이더
    const sf = createSliderField({
      label: pd.label, min: pd.min ?? 0, max: pd.max ?? (pd.type === 'int' ? 100 : 1),
      step: pd.step ?? (pd.type === 'int' ? 1 : 0.01), defaultValue: pd.default,
      onBegin() { _drag.begin(); },
      onChange(v) { _applyParam(pd, pd.type === 'int' ? Math.round(v) : v, true); },
      onCommit() { _drag.commit(); }, onCancel() { _drag.cancel(); },
    });
    sf.setValue(val);
    controls.push(sf);
    const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(sf.el);
    _registerKeyToggle(pd, row, (v) => sf.setValue(v));
    return row;
  }

  // advanced 는 고급 접힘 안에
  const basicWrap = document.createElement('div');
  const advBody = document.createElement('div'); advBody.className = 'adj-adv-body'; advBody.hidden = true;
  el.appendChild(basicWrap);
  for (const pd of (effectDef.params ?? [])) {
    (pd.advanced ? advBody : basicWrap).appendChild(_makeParamControl(pd));
  }
  if ((effectDef.params ?? []).some((p) => p.advanced)) {
    const advHead = document.createElement('button'); advHead.className = 'adj-adv-head';
    advHead.setAttribute('aria-expanded', 'false'); advHead.textContent = '고급';
    advHead.addEventListener('click', () => { advBody.hidden = !advBody.hidden; advHead.setAttribute('aria-expanded', advBody.hidden ? 'false' : 'true'); });
    el.append(advHead, advBody);
  }

  function refresh() {
    const list = targets();
    if (!list.length) return;
    const f = editorState.get().f;
    for (const pk of Object.keys(keyToggles)) {
      const { kt, pd, sync } = keyToggles[pk];
      const clock = _clockState(pd);
      const atF = [], has = [];
      for (const t of list) {
        const keys = _holder(t)?.paramAnim?.[pd.key]?.keys ?? [];
        has.push(keys.length > 0);
        atF.push(keys.some((k) => k.f === f));
      }
      const anyKeys = has.some(Boolean);
      let diamond = '';
      if (anyKeys) diamond = (atF.length && atF.every(Boolean)) ? 'on' : 'other';
      kt.update({ clock, diamond, hasKeys: anyKeys });
      if (!dragging && list.length === 1) sync?.(_curVal(list[0], pd, f));
    }
  }

  function destroy() { for (const c of controls) c.destroy?.(); }

  refresh();
  return { el, refresh, destroy };
}
