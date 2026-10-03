// 타임라인 레이어 목록 패널 (왼쪽) — 펼침 하위 행 + 그룹 드롭
import { computeRows } from './rows.js';

const ROW_H = 28; // C3: 28px

const _TYPE_CHAR = {
  shape: '▣', image: '▤', text: 'T', effect: '★',
  group: '▦', anim: '▶', adjust: '◎', instance: '⬡',
};

export function initLayerList(containerEl, store, editorState) {
  let _dragId     = null;
  let _dragStartY = 0;
  let _dragging   = false;
  let _dropInfo   = null; // { parentId, index } 또는 null

  function _rebuild() {
    if (_dragging) return;
    containerEl.innerHTML = '';
    const doc = store.get();
    const es  = editorState.get();
    const sel = new Set(es.selection);
    const rows = computeRows(doc, es.expanded);
    for (const row of rows) {
      if (row.kind === 'camera') {
        containerEl.appendChild(_makeCameraRow());
      } else if (row.kind === 'layer') {
        const layer = doc.layers[row.id];
        if (layer) containerEl.appendChild(_makeLayerRow(layer, sel.has(row.id), row.hasKeyedProps, es.expanded[row.id]));
      } else if (row.kind === 'prop') {
        containerEl.appendChild(_makePropRow(row.label));
      }
    }
  }

  function _makeCameraRow() {
    const r = document.createElement('div');
    r.className = 'tl-row tl-row-camera';
    r.style.height = ROW_H + 'px';
    r.dataset.kind = 'camera';
    const name = document.createElement('span');
    name.className = 'tl-name';
    name.textContent = '카메라';
    r.appendChild(name);
    return r;
  }

  function _makePropRow(label) {
    const r = document.createElement('div');
    r.className = 'tl-row tl-row-prop';
    r.style.height = ROW_H + 'px';
    r.dataset.kind = 'prop';
    const name = document.createElement('span');
    name.className = 'tl-prop-name';
    name.textContent = label;
    r.appendChild(name);
    return r;
  }

  function _makeLayerRow(layer, selected, hasKeyedProps, expanded) {
    const row = document.createElement('div');
    row.className = 'tl-row'
      + (selected ? ' tl-row-sel' : '')
      + (layer.visible === false ? ' tl-row-hidden' : '');
    row.dataset.id = layer.id;
    row.dataset.kind = 'layer';
    row.style.height = ROW_H + 'px';

    // 펼침 화살표 (키 있는 속성이 있을 때만)
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tl-expand';
    if (hasKeyedProps) {
      expandBtn.textContent = expanded ? '▾' : '▸';
      expandBtn.title = expanded ? '접기' : '펼치기';
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = { ...editorState.get().expanded };
        if (cur[layer.id]) delete cur[layer.id]; else cur[layer.id] = true;
        editorState.set({ expanded: cur });
      });
    } else {
      expandBtn.style.visibility = 'hidden';
    }

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'tl-btn tl-eye' + (layer.visible === false ? ' tl-hidden' : '');
    eyeBtn.textContent = layer.visible === false ? '○' : '●';
    eyeBtn.title = layer.visible === false ? '표시' : '숨김';
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.apply({ type: 'setLayer', id: layer.id, patch: { visible: layer.visible === false ? true : false } });
    });

    const lockBtn = document.createElement('button');
    lockBtn.className = 'tl-btn tl-lock' + (layer.locked ? ' tl-locked' : '');
    lockBtn.textContent = layer.locked ? '잠' : '열';
    lockBtn.style.fontSize = '9px';
    lockBtn.title = layer.locked ? '잠금 해제' : '잠금';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.apply({ type: 'setLayer', id: layer.id, patch: { locked: !layer.locked } });
    });

    const typeEl = document.createElement('span');
    typeEl.className = 'tl-type';
    typeEl.textContent = _TYPE_CHAR[layer.type] ?? '?';

    const nameEl = document.createElement('span');
    nameEl.className = 'tl-name';
    nameEl.textContent = layer.name || layer.type;
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      _startRename(layer.id, nameEl);
    });

    row.append(expandBtn, eyeBtn, lockBtn, typeEl, nameEl);

    // 클릭 → 선택 (C1)
    row.addEventListener('click', (e) => {
      if (_dragging) return;
      const id  = layer.id;
      const es  = editorState.get();
      const cur = es.selection;
      if (e.shiftKey) {
        const ids = _layerOrder();
        const lastSel = cur[cur.length - 1];
        if (lastSel && ids.includes(lastSel)) {
          const from = ids.indexOf(lastSel);
          const to   = ids.indexOf(id);
          const [lo, hi] = from <= to ? [from, to] : [to, from];
          const range = ids.slice(lo, hi + 1);
          editorState.set({ selection: [...new Set([...cur, ...range])] });
        } else {
          editorState.set({ selection: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
        }
      } else if (e.ctrlKey || e.metaKey) {
        editorState.set({ selection: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
      } else {
        editorState.set({ selection: [id] });
      }
      editorState.set({ focusRegion: 'timeline' });
    });

    // 드래그 시작
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      _dragId     = layer.id;
      _dragStartY = e.clientY;
      _dragging   = false;
    });

    return row;
  }

  // 최상위 레이어 순서 (표시 순 = 역순)
  function _layerOrder() {
    return [...store.get().order].reverse();
  }

  // C1: 인라인 이름 편집
  function _startRename(id, nameEl) {
    const layer = store.get().layers[id];
    if (!layer) return;
    const input = document.createElement('input');
    input.className = 'tl-name-edit';
    input.value = layer.name || '';
    input.style.cssText = 'width:100%; font:inherit; background:var(--bg2); color:var(--fg); border:1px solid var(--acc); padding:0 2px; font-size:12px;';
    nameEl.replaceWith(input);
    input.select();
    function _commit() {
      const newName = input.value.trim() || layer.name;
      store.apply({ type: 'setLayer', id, patch: { name: newName } });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _commit(); }
      else if (e.key === 'Escape') { _rebuild(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', _commit);
  }

  // ── 드래그: 순서 바꾸기 / 그룹 안으로 (item 1) ─────────────────────────
  function _onPointerMove(e) {
    if (!_dragId) return;
    const dy = e.clientY - _dragStartY;
    if (!_dragging && Math.abs(dy) < 5) return;
    _dragging = true;
    _computeDrop(e.clientY);
    _updateIndicator();
  }

  // 드롭 위치 계산: 레이어 행들의 화면 영역으로 판정
  function _computeDrop(clientY) {
    const doc  = store.get();
    const rows = [...containerEl.querySelectorAll('.tl-row[data-kind="layer"]')];
    _dropInfo = null;
    let placed = false;
    for (const el of rows) {
      const id = el.dataset.id;
      if (id === _dragId) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) continue;
      const frac  = (clientY - rect.top) / rect.height;
      const layer = doc.layers[id];
      if (layer?.type === 'group' && frac >= 0.25 && frac <= 0.75) {
        // 그룹 안으로
        _dropInfo = { parentId: id, index: (layer.childOrder?.length ?? 0), into: true, markEl: el };
      } else {
        // 순서 바꾸기 (최상위)
        const order   = _layerOrder();
        const uiIdx   = order.indexOf(id);
        const before  = frac < 0.5;
        _dropInfo = { parentId: null, uiIdx, before, markEl: el, markBefore: before };
      }
      placed = true;
      break;
    }
    if (!placed) {
      // 목록 끝으로
      _dropInfo = { parentId: null, uiIdx: _layerOrder().length, before: true, markEl: null };
    }
  }

  function _onPointerUp() {
    if (!_dragId) return;
    const wasDragging = _dragging;
    const dragId = _dragId;
    const info   = _dropInfo;
    _dragId = null; _dragging = false; _dropInfo = null;
    _clearIndicator();
    if (!wasDragging) return;        // 단순 클릭 — click 핸들러가 처리
    if (!info) { _rebuild(); return; }

    if (info.into) {
      store.apply({ type: 'moveLayer', id: dragId, parentId: info.parentId, index: info.index });
    } else {
      // 최상위 순서 바꾸기 — UI(역순) 인덱스를 doc 인덱스로 변환
      const order = _layerOrder();
      const fromUi = order.indexOf(dragId);
      let toUi = info.uiIdx;
      if (!info.before) toUi += 1;
      if (toUi === fromUi || toUi === fromUi + 1) { _rebuild(); return; }
      if (toUi > fromUi) toUi -= 1;
      const total  = store.get().order.length;
      const docIdx = Math.max(0, total - 1 - toUi);
      store.apply({ type: 'moveLayer', id: dragId, parentId: null, index: docIdx });
    }
  }

  function _updateIndicator() {
    _clearIndicator();
    if (!_dropInfo) return;
    if (_dropInfo.into && _dropInfo.markEl) {
      _dropInfo.markEl.classList.add('tl-row-drop-into');
    } else if (_dropInfo.markEl) {
      _dropInfo.markEl.classList.add(_dropInfo.markBefore ? 'tl-row-drag-over-before' : 'tl-row-drag-over-after');
    }
  }

  function _clearIndicator() {
    for (const r of containerEl.querySelectorAll('.tl-row-drag-over-before, .tl-row-drag-over-after, .tl-row-drop-into')) {
      r.classList.remove('tl-row-drag-over-before', 'tl-row-drag-over-after', 'tl-row-drop-into');
    }
  }

  document.addEventListener('pointermove', _onPointerMove);
  document.addEventListener('pointerup',   _onPointerUp);

  const unsubStore = store.subscribe({ layers: true }, () => _rebuild());
  const unsubES    = editorState.subscribe((patch) => {
    if ('selection' in patch || 'expanded' in patch) _rebuild();
  });

  _rebuild();

  function destroy() {
    document.removeEventListener('pointermove', _onPointerMove);
    document.removeEventListener('pointerup',   _onPointerUp);
    unsubStore();
    unsubES();
  }

  return { destroy, rowHeight: ROW_H };
}
