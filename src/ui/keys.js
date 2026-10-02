// 키보드 단축키 — 입력 포커스 중 무시

function _isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const _MOVE_STEP = 1;
const _MOVE_STEP_LARGE = 10;

export function initKeys(store, editorState) {
  function _handler(e) {
    if (_isInputFocused()) return;

    const es = editorState.get();
    const doc = store.get();
    const { selection, f, autoKey } = es;

    const ctrl = e.ctrlKey || e.metaKey;

    // ── 되돌리기 / 다시하기 ────────────────────────────────────────────
    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      store.redo();
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

    // ── 레이어 이동 ────────────────────────────────────────────────────
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !ctrl) {
      if (!selection.length) return;
      e.preventDefault();
      const step = e.shiftKey ? _MOVE_STEP_LARGE : _MOVE_STEP;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;

      for (const id of selection) {
        const layer = doc.layers[id];
        if (!layer || layer.locked) continue;
        const hasKeyX = !!(layer.transform.x.keys?.length);
        const hasKeyY = !!(layer.transform.y.keys?.length);
        const useF = (hasKeyX || hasKeyY || autoKey) ? f : undefined;
        store.apply(
          { type: 'batch', cmds: [
            { type: 'offsetProp', id, path: 'transform.x', delta: dx },
            { type: 'offsetProp', id, path: 'transform.y', delta: dy },
          ]},
          { merge: true },
        );
      }
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
    if (ctrl && e.key === 'd') {
      if (!selection.length) return;
      e.preventDefault();
      store.apply({ type: 'duplicateLayers', ids: [...selection] });
      return;
    }

    // ── Esc: 그룹 편집 종료 ────────────────────────────────────────────
    if (e.key === 'Escape') {
      if (es.groupEdit) {
        editorState.set({ groupEdit: null, selection: [] });
      } else {
        editorState.set({ selection: [] });
      }
      return;
    }
  }

  document.addEventListener('keydown', _handler);
  return () => document.removeEventListener('keydown', _handler);
}
