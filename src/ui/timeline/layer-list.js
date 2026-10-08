// 타임라인 레이어 목록 패널 (왼쪽) — 그룹 계층 + 펼침 하위 행 + 끌어 놓기 + 썸네일
import { computeRows, isSelfOrDescendant } from './rows.js';
import { createLayerAddMenu } from '../layer-add.js';
import { createThumbnailer } from './thumbnail.js';
import { groupSelection, ungroupSelection } from '../group-ops.js';
import { makeComponent, addInstance, hasInstancesOf } from '../component-ops.js';

const ROW_H  = 28; // C3: 28px
const INDENT = 12; // G1: 단계당 들여쓰기 px

const _TYPE_CHAR = {
  shape: '▣', image: '▤', text: 'T', effect: '★',
  group: '▦', anim: '▶', adjust: '◎', instance: '⬡',
};

export function initLayerList(containerEl, store, editorState, deps = {}) {
  let _dragId     = null;
  let _dragStartY = 0;
  let _dragging   = false;
  let _dropInfo   = null;

  // 썸네일(F2-4) — 에셋 어댑터가 있을 때만(데모/실앱). 없으면 썸네일 생략.
  const _thumbs = deps.assets ? createThumbnailer(deps.assets, 20) : null;
  if (typeof window !== 'undefined') window.__thumbnailer = _thumbs; // 테스트용(렌더 횟수)

  // item 2: 트랙 눈금자(24px)와 높이를 맞춘 머리 칸 — sticky 로 맨 위에 고정.
  //   이 칸이 있어야 왼쪽 레이어 행과 오른쪽 트랙 행의 화면 y 가 한 칸도 안 어긋난다.
  // item 5: [+ 레이어] 를 이 머리 칸으로 옮긴다.
  const headEl = document.createElement('div');
  headEl.className = 'tl-layers-head';
  const addWrap = document.createElement('div');
  addWrap.className = 'tl-add-wrap';
  const layerAdd = createLayerAddMenu(store, editorState, addWrap);
  headEl.appendChild(addWrap);
  // F2-6: 카메라 편집 진입 — 누르면 카메라 선택(인스펙터 카메라 섹션·캔버스 영역).
  const camBtn = document.createElement('button');
  camBtn.className = 'tl-cam-btn';
  camBtn.textContent = '카메라';
  camBtn.title = '카메라 편집(X·Y·줌 키프레임)';
  camBtn.addEventListener('click', () => {
    const on = !editorState.get().cameraActive;
    editorState.set({ cameraActive: on, ...(on ? { selection: [] } : {}) });
    camBtn.classList.toggle('is-on', on);
  });
  headEl.appendChild(camBtn);
  const _unsubCam = editorState.subscribe((p) => { if ('cameraActive' in p) camBtn.classList.toggle('is-on', !!editorState.get().cameraActive); });
  containerEl.appendChild(headEl);

  function _rebuild() {
    if (_dragging) return;
    // 머리 칸(headEl)은 두고 행만 교체한다.
    for (const r of [...containerEl.children]) { if (r !== headEl) r.remove(); }
    const doc = store.get();
    const es  = editorState.get();
    const sel = new Set(es.selection);
    for (const row of computeRows(doc, es.expanded)) {
      if (row.kind === 'camera') {
        containerEl.appendChild(_makeCameraRow(row.depth));
      } else if (row.kind === 'layer') {
        const layer = doc.layers[row.id];
        if (layer) containerEl.appendChild(_makeLayerRow(layer, sel.has(row.id), row, es.expanded[row.id]));
      } else if (row.kind === 'prop') {
        containerEl.appendChild(_makePropRow(row.label, row.depth));
      }
    }
  }

  function _indent(el, depth) { el.style.paddingLeft = (depth * INDENT + 2) + 'px'; }

  function _makeCameraRow(depth) {
    const r = document.createElement('div');
    r.className = 'tl-row tl-row-camera'
      + (editorState.get().cameraActive ? ' tl-row-sel' : '');
    r.style.height = ROW_H + 'px';
    r.dataset.kind = 'camera';
    _indent(r, depth);
    const name = document.createElement('span');
    name.className = 'tl-name';
    name.textContent = '카메라';
    r.appendChild(name);
    // F2-6: 클릭 → 카메라 선택(인스펙터 카메라 섹션·캔버스 영역 표시)
    r.addEventListener('click', () => editorState.set({ cameraActive: true, selection: [] }));
    return r;
  }

  function _makePropRow(label, depth) {
    const r = document.createElement('div');
    r.className = 'tl-row tl-row-prop';
    r.style.height = ROW_H + 'px';
    r.dataset.kind = 'prop';
    _indent(r, depth);
    const name = document.createElement('span');
    name.className = 'tl-prop-name';
    name.textContent = label;
    r.appendChild(name);
    return r;
  }

  function _makeLayerRow(layer, selected, rowInfo, expanded) {
    const row = document.createElement('div');
    row.className = 'tl-row'
      + (selected ? ' tl-row-sel' : '')
      + (layer.visible === false ? ' tl-row-hidden' : '');
    row.dataset.id = layer.id;
    row.dataset.kind = 'layer';
    row.style.height = ROW_H + 'px';
    _indent(row, rowInfo.depth);

    // 펼침 화살표 (그룹이거나 키 있는 속성이 있을 때)
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tl-expand';
    if (rowInfo.hasExpandable) {
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

    // 썸네일(20×20, frame 0 기준, 내용 바뀔 때만 다시 그림)
    let thumbEl = null;
    if (_thumbs) {
      thumbEl = document.createElement('span');
      thumbEl.className = 'tl-thumb';
      try {
        const c = _thumbs.getThumb(store.get(), layer);
        if (c) { c.classList.add('tl-thumb-canvas'); thumbEl.appendChild(c); }
      } catch {}
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'tl-name';
    nameEl.textContent = layer.name || layer.type;
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      _startRename(layer.id, nameEl);
    });

    row.append(expandBtn, eyeBtn, lockBtn, typeEl);
    if (thumbEl) row.append(thumbEl);
    row.append(nameEl);

    // 우클릭 → 행 메뉴(F2-8)
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // 선택에 없으면 이 행만 선택
      if (!editorState.get().selection.includes(layer.id)) editorState.set({ selection: [layer.id] });
      _openRowMenu(e.clientX, e.clientY, layer.id);
    });

    // 클릭 → 선택
    row.addEventListener('click', (e) => {
      if (_dragging) return;
      const id  = layer.id;
      const es  = editorState.get();
      const cur = es.selection;
      if (e.shiftKey) {
        const ids = _visibleLayerIds();
        const lastSel = cur[cur.length - 1];
        if (lastSel && ids.includes(lastSel)) {
          const from = ids.indexOf(lastSel);
          const to   = ids.indexOf(id);
          const [lo, hi] = from <= to ? [from, to] : [to, from];
          editorState.set({ selection: [...new Set([...cur, ...ids.slice(lo, hi + 1)])] });
        } else {
          editorState.set({ selection: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
        }
      } else if (e.ctrlKey || e.metaKey) {
        editorState.set({ selection: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
      } else {
        editorState.set({ selection: [id] });
      }
      editorState.set({ focusRegion: 'timeline', cameraActive: false });
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

  // 화면에 보이는 레이어 행 id 순서
  function _visibleLayerIds() {
    return computeRows(store.get(), editorState.get().expanded)
      .filter(r => r.kind === 'layer').map(r => r.id);
  }

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

  // ── 끌어 놓기 (G2) ─────────────────────────────────────────────────────
  function _siblingOrder(parentId) {
    const doc = store.get();
    return parentId ? (doc.layers[parentId]?.childOrder ?? []) : doc.order;
  }

  function _onPointerMove(e) {
    if (!_dragId) return;
    const dy = e.clientY - _dragStartY;
    if (!_dragging && Math.abs(dy) < 5) return;
    _dragging = true;
    _computeDrop(e.clientY);
    _updateIndicator();
  }

  // 드롭 위치 계산 → { parentId, index, into, markEl, markBefore }
  function _computeDrop(clientY) {
    const doc  = store.get();
    _dropInfo = null;

    const rows = [...containerEl.querySelectorAll('.tl-row[data-kind="layer"]')];
    let targetEl = null, frac = 1;
    for (const el of rows) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        targetEl = el;
        frac = (clientY - rect.top) / rect.height;
        break;
      }
    }

    if (!targetEl) {
      // 목록 끝/빈 공간 → 최상위 맨 아래(표시) = order[0] 앞
      _dropInfo = { parentId: null, index: _siblingOrder(null).length, markEl: null };
      return;
    }

    const targetId = targetEl.dataset.id;
    if (targetId === _dragId) return;                       // 자기 위
    if (isSelfOrDescendant(doc, _dragId, targetId)) return;  // 자기 자손 안 (막기)

    const targetLayer = doc.layers[targetId];

    // 그룹 가운데 50% → 그룹 안으로
    if (targetLayer?.type === 'group' && frac >= 0.25 && frac <= 0.75) {
      _dropInfo = {
        parentId: targetId,
        index: (targetLayer.childOrder?.length ?? 0), // 표시 맨 위
        into: true, markEl: targetEl,
      };
      return;
    }

    // 순서 바꾸기 — target의 형제로
    const parentId = targetLayer.parentId ?? null;
    const order    = _siblingOrder(parentId);
    const tIdx     = order.indexOf(targetId);
    const before   = frac < 0.5; // 표시상 target 위
    // 표시는 역순: target 위(before) = doc 인덱스 tIdx+1, 아래 = tIdx
    const docIndex = before ? tIdx + 1 : tIdx;
    _dropInfo = { parentId, index: docIndex, markEl: targetEl, markBefore: before };
  }

  function _onPointerUp() {
    if (!_dragId) return;
    const wasDragging = _dragging;
    const dragId = _dragId;
    const info   = _dropInfo;
    _dragId = null; _dragging = false; _dropInfo = null;
    _clearIndicator();
    if (!wasDragging) return;        // 단순 클릭
    if (!info) { _rebuild(); return; }

    const doc = store.get();
    const curParent = doc.layers[dragId]?.parentId ?? null;
    let index = info.index;
    // 같은 부모 안에서 앞쪽 요소를 들어내면 인덱스가 하나 당겨짐
    if ((info.parentId ?? null) === curParent) {
      const order = _siblingOrder(curParent);
      const from  = order.indexOf(dragId);
      if (from !== -1 && from < index) index -= 1;
    }
    store.apply({ type: 'moveLayer', id: dragId, parentId: info.parentId ?? null, index });
  }

  function _updateIndicator() {
    _clearIndicator();
    if (!_dropInfo || !_dropInfo.markEl) return;
    if (_dropInfo.into) _dropInfo.markEl.classList.add('tl-row-drop-into');
    else _dropInfo.markEl.classList.add(_dropInfo.markBefore ? 'tl-row-drag-over-before' : 'tl-row-drag-over-after');
  }

  function _clearIndicator() {
    for (const r of containerEl.querySelectorAll('.tl-row-drag-over-before, .tl-row-drag-over-after, .tl-row-drop-into')) {
      r.classList.remove('tl-row-drag-over-before', 'tl-row-drag-over-after', 'tl-row-drop-into');
    }
  }

  // ── 행 우클릭 메뉴(F2-8) ───────────────────────────────────────────────
  let _rowMenu = null;
  function _closeRowMenu() { if (_rowMenu) { _rowMenu.remove(); _rowMenu = null; document.removeEventListener('pointerdown', _onMenuOutside, true); } }
  function _onMenuOutside(e) { if (_rowMenu && !_rowMenu.contains(e.target)) _closeRowMenu(); }

  function _openRowMenu(x, y, layerId) {
    _closeRowMenu();
    const doc = store.get();
    const layer = doc.layers[layerId];
    if (!layer) return;
    const sel = editorState.get().selection;
    const items = [];
    items.push(['이름 바꾸기', 'F2', () => { const el = containerEl.querySelector(`.tl-row[data-id="${layerId}"] .tl-name`); if (el) _startRename(layerId, el); }]);
    items.push(['복제', 'Ctrl+D', () => store.apply({ type: 'duplicateLayers', ids: sel.length ? sel : [layerId] })]);
    items.push(['삭제', 'Del', () => _deleteWithConfirm(sel.length ? sel : [layerId])]);
    items.push(['sep']);
    items.push(['그룹으로 묶기', 'Ctrl+G', () => groupSelection(store, editorState)]);
    items.push(['그룹 풀기', 'Ctrl+Shift+G', () => ungroupSelection(store, editorState)]);
    if (layer.type === 'group') {
      items.push([layer.isComponent ? '컴포넌트 (설정됨)' : '컴포넌트로 만들기', '', () => { makeComponent(store, editorState); }, layer.isComponent]);
      items.push(['인스턴스 추가', '', () => { addInstance(store, editorState, layerId); }]);
    }
    items.push(['sep']);
    items.push([layer.locked ? '잠금 해제' : '잠금', '', () => store.apply({ type: 'setLayer', id: layerId, patch: { locked: !layer.locked } })]);
    items.push([layer.visible === false ? '표시' : '숨기기', '', () => store.apply({ type: 'setLayer', id: layerId, patch: { visible: layer.visible === false } })]);
    items.push(['sep']);
    items.push(['맨 위로', '', () => store.apply({ type: 'moveLayer', id: layerId, parentId: layer.parentId ?? null, index: _siblingOrder(layer.parentId ?? null).length })]);
    items.push(['맨 아래로', '', () => store.apply({ type: 'moveLayer', id: layerId, parentId: layer.parentId ?? null, index: 0 })]);

    const menu = document.createElement('div');
    menu.className = 'row-menu';
    for (const it of items) {
      if (it[0] === 'sep') { const s = document.createElement('div'); s.className = 'row-menu-sep'; menu.appendChild(s); continue; }
      const [label, key, fn, disabled] = it;
      const b = document.createElement('button');
      b.className = 'row-menu-item' + (disabled ? ' disabled' : '');
      b.innerHTML = `<span>${label}</span>${key ? `<span class="row-menu-key">${key}</span>` : ''}`;
      if (disabled) b.disabled = true;
      else b.addEventListener('click', (e) => { e.stopPropagation(); _closeRowMenu(); fn(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    // 화면 안으로 위치 보정
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
    _rowMenu = menu;
    setTimeout(() => document.addEventListener('pointerdown', _onMenuOutside, true), 0);
  }

  function _deleteWithConfirm(idsToDelete) {
    const doc = store.get();
    // 마스터(컴포넌트) 삭제 시 인스턴스가 있으면 확인
    const masters = idsToDelete.filter((id) => doc.layers[id]?.type === 'group' && hasInstancesOf(doc, id));
    if (masters.length && typeof confirm === 'function') {
      if (!confirm('이 컴포넌트를 쓰는 인스턴스가 있습니다. 그래도 삭제할까요?')) return;
    }
    store.apply({ type: 'removeLayers', ids: idsToDelete });
    editorState.set({ selection: [] });
  }

  document.addEventListener('pointermove', _onPointerMove);
  document.addEventListener('pointerup',   _onPointerUp);

  const unsubStore = store.subscribe({ layers: true }, () => _rebuild());
  // 카메라 키 변화(meta 스코프)로 카메라 행이 생기거나 사라지므로 meta 에도 구독.
  const unsubMeta  = store.subscribe({ meta: true }, () => _rebuild());
  const unsubES    = editorState.subscribe((patch) => {
    if ('selection' in patch || 'expanded' in patch || 'cameraActive' in patch) _rebuild();
  });

  _rebuild();

  function destroy() {
    document.removeEventListener('pointermove', _onPointerMove);
    document.removeEventListener('pointerup',   _onPointerUp);
    _closeRowMenu();
    layerAdd.destroy();
    _unsubCam();
    unsubStore();
    unsubMeta();
    unsubES();
  }

  return { destroy, rowHeight: ROW_H };
}
