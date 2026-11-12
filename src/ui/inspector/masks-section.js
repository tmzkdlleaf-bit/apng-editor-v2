// R21 — 펜/도형 가리기 속성 패널(임시 자리). 단일 선택 leaf·effect(box)·adjust 에서 보인다.
//   목록(방식·반전·흐림·넓히기·불투명도 + 시계)·사각형/타원 가리기 추가·삭제·복제·순서.
//   캔버스 도구(끌어 그리기·펜·점 편집)는 R21b.
import { makeSectionShell } from './section-shell.js';
import { createDropdown } from '../controls/dropdown.js';
import { createNumberField } from '../controls/number-field.js';
import { createKeyToggle } from '../controls/key-toggle.js';
import { createMask, rectMaskPts, ellipseMaskPts } from '../../core/doc/schema.js';
import { evalProp } from '../../core/anim/prop.js';
import { iconButton } from '../icons.js';

const MASK_TYPES = new Set(['image', 'anim', 'shape', 'text', 'effect', 'adjust']);
const MODES = [['add', '더하기'], ['subtract', '빼기'], ['intersect', '겹친 곳만'], ['difference', '서로 다른 곳만'], ['none', '끔']];
const PROP_FIELDS = [
  { key: 'feather', label: '가장자리 흐림', step: 1, min: 0, max: 400, unit: 'px' },
  { key: 'expand',  label: '넓히기/좁히기', step: 1, min: -400, max: 400, unit: 'px' },
  { key: 'opacity', label: '불투명도', step: 1, min: 0, max: 100, unit: '%', mul: 100 },
];

export function createMasksSection(store, editorState, getStageDeps) {
  const { section, body } = makeSectionShell('가리기', true);

  // 추가 버튼
  const addRow = document.createElement('div'); addRow.className = 'prop-row mask-add-row';
  const addRect = document.createElement('button'); addRect.className = 'quiet sm'; addRect.textContent = '사각형 가리기';
  const addEll  = document.createElement('button'); addEll.className = 'quiet sm'; addEll.textContent = '타원 가리기';
  addRow.append(addRect, addEll);
  body.appendChild(addRow);
  const listEl = document.createElement('div'); listEl.className = 'mask-list';
  body.appendChild(listEl);

  addRect.addEventListener('click', () => _addMask('rect'));
  addEll.addEventListener('click', () => _addMask('ellipse'));

  let _sig = '';
  let _batch = false;
  const _fieldRefs = new Map(); // maskId → { feather, expand, opacity, clocks:{}, modeDd, invert }

  function _singleId() {
    const sel = editorState.get().selection;
    if (sel.length !== 1) return null;
    const l = store.get().layers[sel[0]];
    return l && MASK_TYPES.has(l.type) ? sel[0] : null;
  }

  // 레이어 자체 좌표 기준 내용 크기(대략). image/anim 은 비트맵, shape 은 shape.w/h, 그 외 기본값.
  function _contentSize(layer) {
    if (layer.type === 'shape') return { w: layer.shape?.w ?? 100, h: layer.shape?.h ?? 100 };
    const deps = getStageDeps?.();
    if ((layer.type === 'image' || layer.type === 'anim') && deps?.assets) {
      const bm = layer.type === 'image' ? deps.assets.getBitmap?.(layer.assetId) : deps.assets.getAnimFrames?.(layer.assetId)?.frames?.[0];
      if (bm) return { w: bm.width ?? bm.naturalWidth ?? 200, h: bm.height ?? bm.naturalHeight ?? 200 };
    }
    if (layer.type === 'effect' && layer.scope === 'box' && layer.box) return { w: layer.box.w ?? 100, h: layer.box.h ?? 100 };
    if (layer.type === 'effect') { const m = store.get().meta; return { w: m.width, h: m.height }; } // R28c: 화면 전체 효과
    return { w: 200, h: 200 };
  }

  function _addMask(kind) {
    const id = _singleId(); if (!id) return;
    const { w, h } = _contentSize(store.get().layers[id]);
    const pts = kind === 'ellipse' ? ellipseMaskPts(w / 2, h / 2, w * 0.4, h * 0.4) : rectMaskPts(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
    const n = (store.get().layers[id].masks?.order?.length ?? 0) + 1;
    const mask = createMask({ name: `가리기 ${n}`, path: { value: pts } });
    store.apply({ type: 'addMask', id, mask });
  }

  function _masks(layer) { return (layer.masks?.order ?? []).map((mid) => layer.masks.items[mid]).filter(Boolean); }

  function _structureSig(layer) {
    return (layer.masks?.order ?? []).map((mid) => {
      const m = layer.masks.items[mid];
      return `${mid}:${m.mode}:${m.invert ? 1 : 0}:${m.name}`;
    }).join('|');
  }

  function _toggleMaskKey(id, mid, key) {
    const prop = store.get().layers[id]?.masks?.items?.[mid]?.[key];
    if (!prop) return;
    const f = editorState.get().f;
    const hasAtF = (prop.keys ?? []).some((k) => k.f === f);
    if (hasAtF) store.apply({ type: 'removeKey', id, path: `masks.items.${mid}.${key}`, f });
    else store.apply({ type: 'setKey', id, path: `masks.items.${mid}.${key}`, f, v: evalProp(prop, f), ease: 'linear' });
  }

  function _buildList(layer) {
    listEl.textContent = '';
    _fieldRefs.clear();
    const id = layer.id;
    const order = layer.masks?.order ?? [];
    for (let oi = 0; oi < order.length; oi++) {
      const mid = order[oi];
      const m = layer.masks.items[mid]; if (!m) continue;
      const card = document.createElement('div'); card.className = 'mask-card';

      // 머리: 이름 + 위/아래 + 복제 + 삭제
      const head = document.createElement('div'); head.className = 'mask-card-head';
      const nameInp = document.createElement('input'); nameInp.className = 'mask-name'; nameInp.value = m.name ?? '가리기';
      nameInp.addEventListener('change', () => store.apply({ type: 'setMaskProp', id, maskId: mid, key: 'name', value: nameInp.value }));
      const up = document.createElement('button'); up.className = 'quiet sm'; up.textContent = '위'; up.title = '위로';
      const down = document.createElement('button'); down.className = 'quiet sm'; down.textContent = '아래'; down.title = '아래로';
      up.disabled = oi === 0; down.disabled = oi === order.length - 1;
      up.addEventListener('click', () => store.apply({ type: 'moveMask', id, maskId: mid, toIndex: oi - 1 }));
      down.addEventListener('click', () => store.apply({ type: 'moveMask', id, maskId: mid, toIndex: oi + 1 }));
      const dup = iconButton('duplicate', { label: '복제', title: '복제' });
      dup.addEventListener('click', () => store.apply({ type: 'duplicateMask', id, maskId: mid }));
      const del = iconButton('delete', { label: '삭제', title: '삭제' });
      del.addEventListener('click', () => store.apply({ type: 'removeMask', id, maskId: mid }));
      head.append(nameInp, up, down, dup, del);
      card.appendChild(head);

      const refs = { clocks: {} };
      // 방식 + 반전 + 모양 시계
      const modeRow = document.createElement('div'); modeRow.className = 'prop-row';
      const modeDd = createDropdown({ ariaLabel: '가리기 방식', options: MODES.map(([value, label]) => ({ value, label })), value: m.mode,
        onChange: (v) => store.apply({ type: 'setMaskProp', id, maskId: mid, key: 'mode', value: v }) });
      const invLabel = document.createElement('label'); invLabel.className = 'mask-invert';
      const invChk = document.createElement('input'); invChk.type = 'checkbox'; invChk.checked = !!m.invert;
      invChk.addEventListener('change', () => store.apply({ type: 'setMaskProp', id, maskId: mid, key: 'invert', value: invChk.checked }));
      const invText = document.createElement('span'); invText.textContent = '반전';
      invLabel.append(invChk, invText);
      const shapeClock = createKeyToggle({ showClock: true, onDiamond: () => _toggleMaskKey(id, mid, 'path') });
      refs.clocks.path = shapeClock;
      modeRow.append(modeDd.el, invLabel, shapeClock.el);
      card.appendChild(modeRow);
      refs.modeDd = modeDd;

      // 흐림·넓히기·불투명도 + 시계
      refs.fields = {};
      for (const pf of PROP_FIELDS) {
        const row = document.createElement('div'); row.className = 'prop-row';
        const mul = pf.mul ?? 1;
        const field = createNumberField({ label: pf.label, step: pf.step, min: pf.min, max: pf.max, unit: pf.unit,
          defaultValue: (pf.key === 'opacity' ? 100 : 0),
          onBegin() { if (_batch) return; _batch = true; store.begin('가리기'); },
          onChange(v) { if (!_batch) return; store.preview({ type: 'setMaskProp', id, maskId: mid, key: pf.key, value: v / mul }); },
          onCommit() { _batch = false; store.commit(); },
          onCancel() { _batch = false; store.cancel(); },
        });
        const clock = createKeyToggle({ showClock: true, onDiamond: () => _toggleMaskKey(id, mid, pf.key) });
        refs.clocks[pf.key] = clock;
        field.el.appendChild(clock.el);
        row.appendChild(field.el);
        card.appendChild(row);
        refs.fields[pf.key] = field;
      }
      _fieldRefs.set(mid, refs);
      listEl.appendChild(card);
    }
  }

  function _updateValues(layer) {
    const f = editorState.get().f;
    for (const [mid, refs] of _fieldRefs) {
      const m = layer.masks?.items?.[mid]; if (!m) continue;
      for (const pf of PROP_FIELDS) {
        const mul = pf.mul ?? 1;
        refs.fields[pf.key].setValue(evalProp(m[pf.key] ?? { value: pf.key === 'opacity' ? 1 : 0 }, f) * mul);
      }
      for (const key of ['path', 'feather', 'expand', 'opacity']) {
        const prop = m[key];
        const hasKeys = !!(prop?.keys?.length);
        const atF = hasKeys && prop.keys.some((k) => k.f === f);
        refs.clocks[key]?.update({ clock: hasKeys ? 'on' : 'off', diamond: atF ? 'on' : (hasKeys ? 'other' : '') });
      }
    }
  }

  function _refresh() {
    if (_batch) return;
    const id = _singleId();
    if (!id) { section.style.display = 'none'; return; }
    section.style.display = '';
    const layer = store.get().layers[id];
    const sig = _structureSig(layer);
    if (sig !== _sig) { _sig = sig; _buildList(layer); }
    _updateValues(layer);
  }

  const unsubStore = store.subscribe({ layers: true }, () => { if (!_batch) _refresh(); });
  const unsubES = editorState.subscribe((p) => { if ('selection' in p || 'f' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
