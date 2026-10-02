// 키보드 단축키 — 입력 포커스 중 무시

import { buildPropCmd, getStartValue } from './canvas/edit-prop.js';

function _isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const _MOVE_STEP       = 1;
const _MOVE_STEP_LARGE = 10;

export function initKeys(store, editorState, getDragging = () => false) {
  // 복사 버퍼 (레이어 id 목록)
  let _clipboard = [];
  // 방향키 500ms merge 창
  let _arrowMergeTimer = null;
  let _canMergeArrow   = false;

  function _handler(e) {
    if (_isInputFocused()) return;

    const es  = editorState.get();
    const doc = store.get();
    const { selection, f, autoKey } = es;

    const ctrl = e.ctrlKey || e.metaKey;

    // ── 되돌리기 / 다시하기 ────────────────────────────────────────────
    if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }
    if (ctrl && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      store.redo();
      return;
    }

    // ── 복사 / 붙여넣기 ────────────────────────────────────────────────
    if (ctrl && e.key.toLowerCase() === 'c') {
      _clipboard = selection.filter(id => doc.layers[id]);
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'v') {
      if (!_clipboard.length) return;
      e.preventDefault();
      store.apply({ type: 'duplicateLayers', ids: [..._clipboard] });
      return;
    }

    // ── 도구 전환 ──────────────────────────────────────────────────────
    if (!ctrl && e.key === 'v') { editorState.set({ tool: 'select' }); return; }
    if (!ctrl && e.key === 'h') { editorState.set({ tool: 'hand' });   return; }

    // ── 그리드 토글 ────────────────────────────────────────────────────
    if (!ctrl && e.key === 'g') {
      editorState.set({ grid: !es.grid });
      return;
    }

    // ── 프레임 이동 ────────────────────────────────────────────────────
    if (!ctrl && e.key === ',') {
      editorState.set({ f: Math.max(0, f - 1) });
      return;
    }
    if (!ctrl && e.key === '.') {
      editorState.set({ f: Math.min(doc.meta.frameCount - 1, f + 1) });
      return;
    }

    // ── 레이어 이동 (방향키) ───────────────────────────────────────────
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !ctrl) {
      if (!selection.length) return;
      e.preventDefault();
      const step = e.shiftKey ? _MOVE_STEP_LARGE : _MOVE_STEP;
      const ddx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const ddy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;

      clearTimeout(_arrowMergeTimer);

      const cmds = [];
      const currentDoc = store.get();
      for (const id of selection) {
        const layer = currentDoc.layers[id];
        if (!layer || layer.locked) continue;
        const curX = getStartValue(currentDoc, id, 'transform.x', f);
        const curY = getStartValue(currentDoc, id, 'transform.y', f);
        cmds.push(buildPropCmd(currentDoc, id, 'transform.x', curX + ddx, f, autoKey));
        cmds.push(buildPropCmd(currentDoc, id, 'transform.y', curY + ddy, f, autoKey));
      }
      if (cmds.length) {
        store.apply({ type: 'batch', cmds }, { merge: _canMergeArrow });
      }

      _canMergeArrow = true;
      _arrowMergeTimer = setTimeout(() => { _canMergeArrow = false; }, 500);
      return;
    }

    // ── 레이어 삭제 ────────────────────────────────────────────────────
    if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
      if (!selection.length) return;
      e.preventDefault();
      store.apply({ type: 'removeLayers', ids: [...selection] });
      editorState.set({ selection: [] });
      return;
    }

    // ── 복제 ───────────────────────────────────────────────────────────
    if (ctrl && e.key.toLowerCase() === 'd') {
      if (!selection.length) return;
      e.preventDefault();
      store.apply({ type: 'duplicateLayers', ids: [...selection] });
      return;
    }

    // ── Esc ────────────────────────────────────────────────────────────
    if (e.key === 'Escape') {
      // 드래그 중이면 drag.js가 처리 (stopImmediatePropagation으로 여기까지 안 옴)
      if (getDragging()) return;
      if (es.groupEdit) {
        editorState.set({ groupEdit: null, selection: [] });
      } else {
        editorState.set({ selection: [] });
      }
      return;
    }
  }

  document.addEventListener('keydown', _handler);
  return () => {
    document.removeEventListener('keydown', _handler);
    clearTimeout(_arrowMergeTimer);
  };
}
