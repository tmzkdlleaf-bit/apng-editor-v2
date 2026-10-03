// 타임라인 레이어 목록 패널 (왼쪽)
const ROW_H = 32;

const _TYPE_CHAR = {
  shape: '▣', image: '▤', text: 'T', effect: '★',
  group: '▦', anim: '▶', adjust: '◎', instance: '⬡',
};

export function initLayerList(containerEl, store, editorState) {
  // 드래그 상태 (document 레벨)
  let _dragId     = null;
  let _dragStartY = 0;
  let _dragging   = false;
  let _dropIdx    = -1;

  function _reversedOrder() {
    return [...store.get().order].reverse();
  }

  function _rebuildRows() {
    if (_dragging) return;
    containerEl.innerHTML = '';
    const doc = store.get();
    const es  = editorState.get();
    const sel = new Set(es.selection);
    for (const id of _reversedOrder()) {
      const layer = doc.layers[id];
      if (!layer) continue;
      containerEl.appendChild(_makeRow(layer, sel.has(id)));
    }
  }

  function _makeRow(layer, selected) {
    const row = document.createElement('div');
    row.className = 'tl-row'
      + (selected ? ' tl-row-sel' : '')
      + (layer.visible === false ? ' tl-row-hidden' : '');
    row.dataset.id = layer.id;
    row.style.height = ROW_H + 'px';

    // 가시성 토글
    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'tl-btn tl-eye' + (layer.visible === false ? ' tl-hidden' : '');
    eyeBtn.textContent = layer.visible === false ? '○' : '●';
    eyeBtn.title = layer.visible === false ? '표시' : '숨김';
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.apply({ type: 'setLayer', id: layer.id, patch: { visible: layer.visible === false ? true : false } });
    });

    // 잠금 토글
    const lockBtn = document.createElement('button');
    lockBtn.className = 'tl-btn tl-lock' + (layer.locked ? ' tl-locked' : '');
    lockBtn.textContent = layer.locked ? '잠' : '열';
    lockBtn.style.fontSize = '9px';
    lockBtn.title = layer.locked ? '잠금 해제' : '잠금';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.apply({ type: 'setLayer', id: layer.id, patch: { locked: !layer.locked } });
    });

    // 타입 아이콘
    const typeEl = document.createElement('span');
    typeEl.className = 'tl-type';
    typeEl.textContent = _TYPE_CHAR[layer.type] ?? '?';

    // 이름
    const nameEl = document.createElement('span');
    nameEl.className = 'tl-name';
    nameEl.textContent = layer.name || layer.type;

    row.append(eyeBtn, lockBtn, typeEl, nameEl);

    // 클릭 → 선택 (pointerdown+pointerup으로 drag와 분리)
    row.addEventListener('click', (e) => {
      if (_dragging) return;
      const id  = layer.id;
      const cur = editorState.get().selection;
      if (e.shiftKey) {
        editorState.set({ selection: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
      } else {
        editorState.set({ selection: [id] });
      }
    });

    // 드래그 시작 (행 전체에서 시작, 단 버튼 클릭은 버튼이 stopPropagation)
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // 버튼 클릭은 드래그 시작 안 함
      if (e.target.tagName === 'BUTTON') return;
      _dragId     = layer.id;
      _dragStartY = e.clientY;
      _dragging   = false;
    });

    return row;
  }

  // document 레벨 드래그 핸들러 (pointer capture 없이)
  function _onPointerMove(e) {
    if (!_dragId) return;
    const dy = e.clientY - _dragStartY;
    if (!_dragging && Math.abs(dy) < 5) return;
    _dragging = true;

    const rect   = containerEl.getBoundingClientRect();
    const relY   = e.clientY - rect.top + containerEl.scrollTop;
    const rawIdx = Math.round(relY / ROW_H);
    _dropIdx     = Math.max(0, Math.min(_reversedOrder().length, rawIdx));
    _updateDropIndicator();
  }

  function _onPointerUp(e) {
    if (!_dragId) return;
    const wasDragging = _dragging;
    const savedDragId = _dragId;
    const savedDropIdx = _dropIdx;
    _dragId   = null;
    _dragging = false;
    _dropIdx  = -1;
    _clearDropIndicator();
    if (wasDragging) {
      const ids    = _reversedOrder();
      const fromUi = ids.indexOf(savedDragId);
      if (fromUi !== -1 && savedDropIdx !== fromUi && savedDropIdx !== fromUi + 1) {
        const total = store.get().order.length;
        let toUi = savedDropIdx;
        if (toUi > fromUi) toUi--;
        const docIdx = Math.max(0, total - 1 - toUi);
        store.apply({ type: 'moveLayer', id: savedDragId, index: docIdx });
        // store subscription이 _rebuildRows를 호출함
      } else {
        // 드래그했지만 위치 불변 → 수동 재렌더
        _rebuildRows();
      }
    }
    // 클릭(드래그 없음)의 경우: click 이벤트 후에 store 구독으로 재렌더
  }

  function _updateDropIndicator() {
    _clearDropIndicator();
    const rows = containerEl.querySelectorAll('.tl-row');
    if (!rows.length) return;
    if (_dropIdx <= 0) {
      rows[0].classList.add('tl-row-drag-over-before');
    } else if (_dropIdx >= rows.length) {
      rows[rows.length - 1].classList.add('tl-row-drag-over-after');
    } else {
      rows[_dropIdx].classList.add('tl-row-drag-over-before');
    }
  }

  function _clearDropIndicator() {
    for (const r of containerEl.querySelectorAll('.tl-row-drag-over-before, .tl-row-drag-over-after')) {
      r.classList.remove('tl-row-drag-over-before', 'tl-row-drag-over-after');
    }
  }

  document.addEventListener('pointermove', _onPointerMove);
  document.addEventListener('pointerup',   _onPointerUp);

  const unsubStore = store.subscribe({ layers: true }, () => _rebuildRows());
  const unsubES    = editorState.subscribe((patch) => {
    if ('selection' in patch) _rebuildRows();
  });

  _rebuildRows();

  function destroy() {
    document.removeEventListener('pointermove', _onPointerMove);
    document.removeEventListener('pointerup',   _onPointerUp);
    unsubStore();
    unsubES();
  }

  return { destroy, rowHeight: ROW_H };
}
