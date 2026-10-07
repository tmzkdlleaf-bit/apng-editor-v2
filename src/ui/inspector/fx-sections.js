// 인스펙터 — 색 덮기(tint) · 트랙 매트(mask) · 외곽선(outline) · 흩어지며 퇴장(exit).
// 모두 정적 레이어 속성이라 setLayer 패치로 바꾼다. 렌더는 core/render 가 이미 담당.
import { makeSectionShell } from './section-shell.js';
import { createSliderField } from '../controls/slider-field.js';
import { createNumberField } from '../controls/number-field.js';
import { createColorField } from '../controls/color-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { iconMarkup, hasIcon } from '../icons.js';
import { hitTest } from '../canvas/hit.js';
import { screenToDoc } from '../canvas/transform.js';

// 렌더가 각 효과를 처리하는 레이어 타입.
const TINT_TYPES    = new Set(['image', 'anim']);
const MATTE_TYPES   = new Set(['image', 'anim', 'shape', 'text']);
const OUTLINE_TYPES = new Set(['image']); // 렌더는 image 만(anim/shape/text는 자체 획으로 — 보고 참고)
const EXIT_TYPES    = new Set(['image']);

function _idsOfType(store, editorState, typeSet) {
  const doc = store.get();
  return editorState.get().selection.filter((id) => typeSet.has(doc.layers[id]?.type));
}
// 레이어의 조상 id 집합(부모를 타고 올라가며)
function _ancestors(doc, id) {
  const set = new Set();
  let cur = doc.layers[id]?.parentId ?? null;
  while (cur) { set.add(cur); cur = doc.layers[cur]?.parentId ?? null; }
  return set;
}
function _typeIconMarkup(type) {
  const name = 'type-' + type;
  return hasIcon(name) ? iconMarkup(name, { size: 13 }) : '';
}

// 공통: setLayer 로 patch 적용. preview=드래그 중.
function _applyPatch(store, ids, patchFn, preview) {
  const doc = store.get();
  const cmds = ids.map((id) => ({ type: 'setLayer', id, patch: patchFn(doc.layers[id]) }));
  if (!cmds.length) return;
  const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
  if (preview) store.preview(cmd); else store.apply(cmd);
}

// ── 색 덮기 ───────────────────────────────────────────────────────────────
export function createTintSection(store, editorState) {
  const { section, body } = makeSectionShell('색 덮기', true);
  let _batch = false;
  const ids = () => _idsOfType(store, editorState, TINT_TYPES);

  const enable = _checkbox('색 덮기 사용');
  const color = createColorField({
    value: '#ff6699',
    onInput: (hex) => { _begin(); _set({ color: hex }, true); },
    onChange: (hex) => { _begin(); _set({ color: hex }, true); _commit(); },
  });
  const strength = createSliderField({
    label: '강도', min: 0, max: 100, step: 1, unit: '%', defaultValue: 100,
    onBegin: _begin, onChange: (v) => { if (_batch) _set({ strength: v / 100 }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const colorRow = _row('덮을 색', color.el);
  const strRow = document.createElement('div'); strRow.className = 'prop-row'; strRow.appendChild(strength.el);
  body.append(enable.row, colorRow, strRow);

  enable.input.addEventListener('change', () => {
    _begin();
    if (enable.input.checked) _set({ color: color.getValue() || '#ff6699', strength: 1 }, true);
    else _setNull();
    _commit();
    _refresh();
  });

  function _cur() { const doc = store.get(); return doc.layers[ids()[0]]?.tint ?? null; }
  function _set(partial, preview) {
    _applyPatch(store, ids(), (ly) => ({ tint: { ...(ly.tint ?? { color: '#ff6699', strength: 1 }), ...partial } }), preview);
  }
  function _setNull() { _applyPatch(store, ids(), () => ({ tint: null }), true); }
  function _begin() { if (_batch) return; _batch = true; store.begin('색 덮기'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const t = _cur();
    enable.input.checked = !!t;
    colorRow.style.display = t ? '' : 'none';
    strRow.style.display = t ? '' : 'none';
    if (t) { color.setValue(t.color ?? '#ff6699'); strength.setValue(Math.round((t.strength ?? 1) * 100)); }
  }
  return _wire(section, store, editorState, _refresh, () => color.destroy());
}

// ── 트랙 매트 ─────────────────────────────────────────────────────────────
export function createMatteSection(store, editorState, getStageDeps) {
  const { section, body } = makeSectionShell('트랙 매트', true);
  let _batch = false, _picking = false, _pickCleanup = null;
  const ids = () => _idsOfType(store, editorState, MATTE_TYPES);

  const enable = _checkbox('매트 사용');

  const sourceDd = createDropdown({
    ariaLabel: '매트 소스 레이어', options: [{ value: '', label: '(없음)' }],
    renderItem: (el, opt) => { el.innerHTML = (opt.icon ?? '') + `<span>${opt.label}</span>`; },
    onChange: (v) => { _begin(); _set({ sourceId: v || null }, true); _commit(); _refresh(); },
  });
  const pickBtn = document.createElement('button');
  pickBtn.className = 'quiet sm'; pickBtn.textContent = '캔버스에서 고르기';
  pickBtn.title = '누른 뒤 캔버스에서 소스로 쓸 레이어를 클릭';

  const modeDd = createDropdown({
    ariaLabel: '매트 방식',
    options: [{ value: 'alpha', label: '알파' }, { value: 'luma', label: '루마(밝기)' }],
    onChange: () => { _begin(); _set({ mode: modeDd.getValue() }, true); _commit(); },
  });
  const invert = _checkbox('반전');
  const feather = createSliderField({
    label: '가장자리 흐림', min: 0, max: 50, step: 1, unit: 'px', defaultValue: 0,
    onBegin: _begin, onChange: (v) => { if (_batch) _set({ feather: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });

  const srcRow = _row('소스', sourceDd.el);
  const pickRow = document.createElement('div'); pickRow.className = 'prop-row'; pickRow.appendChild(pickBtn);
  const modeRow = _row('방식', modeDd.el);
  const featRow = document.createElement('div'); featRow.className = 'prop-row'; featRow.appendChild(feather.el);
  body.append(enable.row, srcRow, pickRow, modeRow, invert.row, featRow);

  enable.input.addEventListener('change', () => {
    _begin();
    if (enable.input.checked) _set({ sourceId: _firstCandidate(), mode: 'alpha', invert: false, feather: 0 }, true);
    else _setNull();
    _commit(); _refresh();
  });
  invert.input.addEventListener('change', () => { _begin(); _set({ invert: invert.input.checked }, true); _commit(); });
  pickBtn.addEventListener('click', () => _startPick());

  // 자기·자기 조상을 뺀 소스 후보 [{value,label,icon}]
  function _candidates() {
    const doc = store.get();
    const self = ids()[0];
    if (!self) return [{ value: '', label: '(없음)' }];
    const anc = _ancestors(doc, self);
    const out = [{ value: '', label: '(없음)' }];
    for (const id of doc.order) _collect(doc, id, self, anc, out);
    return out;
  }
  function _collect(doc, id, self, anc, out) {
    const ly = doc.layers[id];
    if (!ly) return;
    if (id !== self && !anc.has(id)) {
      out.push({ value: id, label: ly.name || ly.type, icon: _typeIconMarkup(ly.type) });
    }
    for (const cid of (ly.childOrder ?? [])) _collect(doc, cid, self, anc, out);
  }
  function _firstCandidate() { const c = _candidates().filter((o) => o.value); return c[0]?.value ?? null; }

  function _startPick() {
    const deps = getStageDeps?.();
    if (!deps?.overlay) { pickBtn.textContent = '캔버스 준비 안 됨'; return; }
    if (_picking) { _stopPick(); return; }
    _picking = true;
    pickBtn.classList.add('is-on'); pickBtn.textContent = '캔버스에서 클릭…';
    const onClick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const { overlay } = deps;
      const es = editorState.get(); const doc = store.get();
      const rect = overlay.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      const d = screenToDoc(e.clientX - rect.left, e.clientY - rect.top, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
      const hitId = hitTest(doc, d.x, d.y, es.f, null, deps.assets);
      const self = ids()[0];
      const anc = _ancestors(doc, self);
      if (hitId && hitId !== self && !anc.has(hitId)) {
        _begin(); _set({ sourceId: hitId }, true); _commit(); _refresh();
      }
      _stopPick();
    };
    deps.overlay.addEventListener('click', onClick, { capture: true, once: true });
    _pickCleanup = () => deps.overlay.removeEventListener('click', onClick, { capture: true });
  }
  function _stopPick() {
    _picking = false; pickBtn.classList.remove('is-on'); pickBtn.textContent = '캔버스에서 고르기';
    _pickCleanup?.(); _pickCleanup = null;
  }

  function _cur() { const doc = store.get(); return doc.layers[ids()[0]]?.mask ?? null; }
  function _set(partial, preview) {
    _applyPatch(store, ids(), (ly) => ({ mask: { ...(ly.mask ?? { mode: 'alpha', invert: false, feather: 0 }), ...partial } }), preview);
  }
  function _setNull() { _applyPatch(store, ids(), () => ({ mask: null }), true); }
  function _begin() { if (_batch) return; _batch = true; store.begin('트랙 매트'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const m = _cur();
    enable.input.checked = !!m;
    for (const r of [srcRow, pickRow, modeRow, invert.row, featRow]) r.style.display = m ? '' : 'none';
    sourceDd.setOptions(_candidates());
    if (m) {
      sourceDd.setValue(m.sourceId ?? '');
      modeDd.setValue(m.mode ?? 'alpha');
      invert.input.checked = !!m.invert;
      feather.setValue(m.feather ?? 0);
    }
  }
  return _wire(section, store, editorState, _refresh, () => { sourceDd.destroy(); modeDd.destroy(); _stopPick(); });
}

// ── 외곽선 ────────────────────────────────────────────────────────────────
export function createOutlineSection(store, editorState) {
  const { section, body } = makeSectionShell('외곽선', true);
  let _batch = false;
  const ids = () => _idsOfType(store, editorState, OUTLINE_TYPES);

  const enable = _checkbox('외곽선 사용');
  const color = createColorField({
    value: '#ffffff',
    onInput: (hex) => { _begin(); _set({ color: hex }, true); },
    onChange: (hex) => { _begin(); _set({ color: hex }, true); _commit(); },
  });
  const width = createSliderField({
    label: '두께', min: 0.5, max: 20, step: 0.5, unit: 'px', defaultValue: 2,
    onBegin: _begin, onChange: (v) => { if (_batch) _set({ width: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const qualityDd = createDropdown({
    ariaLabel: '외곽선 품질',
    options: [{ value: '1', label: '낮음' }, { value: '2', label: '보통' }, { value: '3', label: '높음' }],
    onChange: () => { _begin(); _set({ quality: parseInt(qualityDd.getValue(), 10) }, true); _commit(); },
  });
  const colorRow = _row('색', color.el);
  const widthRow = document.createElement('div'); widthRow.className = 'prop-row'; widthRow.appendChild(width.el);
  const qRow = _row('품질', qualityDd.el);
  body.append(enable.row, colorRow, widthRow, qRow);

  enable.input.addEventListener('change', () => {
    _begin();
    if (enable.input.checked) _set({ color: color.getValue() || '#ffffff', width: 2, quality: 2 }, true);
    else _setNull();
    _commit(); _refresh();
  });

  function _cur() { const doc = store.get(); return doc.layers[ids()[0]]?.outline ?? null; }
  function _set(partial, preview) {
    _applyPatch(store, ids(), (ly) => ({ outline: { ...(ly.outline ?? { color: '#ffffff', width: 2, quality: 2 }), ...partial } }), preview);
  }
  function _setNull() { _applyPatch(store, ids(), () => ({ outline: null }), true); }
  function _begin() { if (_batch) return; _batch = true; store.begin('외곽선'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const o = _cur();
    enable.input.checked = !!o;
    for (const r of [colorRow, widthRow, qRow]) r.style.display = o ? '' : 'none';
    if (o) { color.setValue(o.color ?? '#ffffff'); width.setValue(o.width ?? 2); qualityDd.setValue(String(o.quality ?? 2)); }
  }
  return _wire(section, store, editorState, _refresh, () => { color.destroy(); qualityDd.destroy(); });
}

// ── 흩어지며 퇴장 ─────────────────────────────────────────────────────────
export function createExitSection(store, editorState) {
  const { section, body } = makeSectionShell('흩어지며 퇴장', true);
  let _batch = false;
  const ids = () => _idsOfType(store, editorState, EXIT_TYPES);

  const enable = _checkbox('가루처럼 흩어지며 사라짐');
  const startF = createNumberField({
    label: '시작 프레임', min: 0, max: 9999, step: 1, defaultValue: 0,
    onBegin: _begin, onChange: (v) => { if (_batch) _set({ startF: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const endF = createNumberField({
    label: '끝 프레임', min: 0, max: 9999, step: 1, defaultValue: 12,
    onBegin: _begin, onChange: (v) => { if (_batch) _set({ endF: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const seed = createNumberField({
    label: '시드', min: 0, max: 99999, step: 1, defaultValue: 1,
    onBegin() { if (_batch) return; _batch = true; store.begin('퇴장 시드'); },
    onChange: (v) => { if (_batch) _applyPatch(store, ids(), () => ({ seed: Math.round(v) }), true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const sRow = document.createElement('div'); sRow.className = 'prop-row'; sRow.appendChild(startF.el);
  const eRow = document.createElement('div'); eRow.className = 'prop-row'; eRow.appendChild(endF.el);
  const seedRow = document.createElement('div'); seedRow.className = 'prop-row'; seedRow.appendChild(seed.el);
  body.append(enable.row, sRow, eRow, seedRow);

  enable.input.addEventListener('change', () => {
    _begin();
    if (enable.input.checked) {
      const doc = store.get();
      const fc = doc.meta.frameCount ?? 24;
      _applyPatch(store, ids(), () => ({ exit: { type: 'disintegrate', startF: Math.max(0, fc - 12), endF: fc - 1 } }), true);
    } else {
      _applyPatch(store, ids(), () => ({ exit: null }), true);
    }
    _commit(); _refresh();
  });

  function _cur() { const doc = store.get(); return doc.layers[ids()[0]]?.exit ?? null; }
  function _set(partial, preview) {
    _applyPatch(store, ids(), (ly) => ({ exit: { ...(ly.exit ?? { type: 'disintegrate', startF: 0, endF: 12 }), ...partial } }), preview);
  }
  function _begin() { if (_batch) return; _batch = true; store.begin('흩어지며 퇴장'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const doc = store.get();
    const ex = _cur();
    enable.input.checked = !!ex;
    for (const r of [sRow, eRow, seedRow]) r.style.display = ex ? '' : 'none';
    if (ex) {
      startF.setValue(ex.startF ?? 0);
      endF.setValue(ex.endF ?? 12);
      seed.setValue(doc.layers[list[0]]?.seed ?? 1);
    }
  }
  return _wire(section, store, editorState, _refresh, () => {});
}

// ── 공통 소형 헬퍼 ────────────────────────────────────────────────────────
function _checkbox(labelText) {
  const row = document.createElement('div'); row.className = 'prop-row';
  const label = document.createElement('label'); label.className = 'fx-check';
  const input = document.createElement('input'); input.type = 'checkbox';
  const span = document.createElement('span'); span.textContent = labelText;
  label.append(input, span); row.appendChild(label);
  return { row, input, label };
}
function _row(labelText, controlEl) {
  const row = document.createElement('div'); row.className = 'prop-row';
  const label = document.createElement('label'); label.className = 'num-label'; label.textContent = labelText;
  row.append(label, controlEl);
  return row;
}
// 구독·새로고침·정리 묶기
function _wire(section, store, editorState, refresh, destroyExtra) {
  const unsubStore = store.subscribe({ layers: true }, refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) refresh(); });
  refresh();
  return {
    el: section,
    destroy() { unsubStore(); unsubES(); destroyExtra?.(); },
  };
}
