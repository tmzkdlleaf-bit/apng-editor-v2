// 타임라인 레이어 행 우클릭 메뉴(F2-8) — layer-list.js 에서 나눴다(R23d item 12). 동작은 그대로.
import { groupSelection, ungroupSelection } from '../group-ops.js';
import { makeComponent, addInstance, hasInstancesOf } from '../component-ops.js';

export function createLayerRowMenu({ store, editorState, containerEl, startRename, siblingOrder }) {
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
    items.push(['이름 바꾸기', 'F2', () => { const el = containerEl.querySelector(`.tl-row[data-id="${layerId}"] .tl-name`); if (el) startRename(layerId, el); }]);
    items.push(['복제', 'Ctrl+D', () => store.apply({ type: 'duplicateLayers', ids: sel.length ? sel : [layerId] })]);
    items.push(['삭제', 'Del', () => _deleteWithConfirm(sel.length ? sel : [layerId])]);
    items.push(['sep']);
    items.push(['그룹으로 묶기', 'Ctrl+G', () => groupSelection(store, editorState)]);
    items.push(['그룹 풀기', 'Ctrl+Shift+G', () => ungroupSelection(store, editorState)]);
    if (layer.type === 'group') {
      items.push([layer.isComponent ? '컴포넌트 (설정됨)' : '컴포넌트로 만들기', '', () => { makeComponent(store, editorState); }, layer.isComponent]);
      items.push(['인스턴스 추가', '', () => { addInstance(store, editorState, layerId); }]);
      // 내 부품으로 저장(R14-3) — 선택이 아니라 이 그룹을 저장하도록 선택을 맞춘 뒤 저장.
      items.push(['내 부품으로 저장', '', () => {
        editorState.set({ selection: [layerId] });
        import('../library-parts.js').then((m) => m.saveGroupAsPart(store, editorState));
      }]);
    }
    items.push(['sep']);
    items.push([layer.locked ? '잠금 해제' : '잠금', '', () => store.apply({ type: 'setLayer', id: layerId, patch: { locked: !layer.locked } })]);
    items.push([layer.visible === false ? '표시' : '숨기기', '', () => store.apply({ type: 'setLayer', id: layerId, patch: { visible: layer.visible === false } })]);
    items.push(['sep']);
    items.push(['맨 위로', '', () => store.apply({ type: 'moveLayer', id: layerId, parentId: layer.parentId ?? null, index: siblingOrder(layer.parentId ?? null).length })]);
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

  return { open: _openRowMenu, close: _closeRowMenu, deleteWithConfirm: _deleteWithConfirm };
}
