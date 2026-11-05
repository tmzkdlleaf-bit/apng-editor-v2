// 키보드 단축키 — 입력 포커스 중 무시

import { buildPropCmd, getStartValue } from './canvas/edit-prop.js';
import { groupSelection, ungroupSelection } from './group-ops.js';
import { openLoopCheck } from './loop-check.js';
import { getProp } from '../core/anim/props.js';
import { easyEaseCommands, holdToggleCommands } from './timeline/graph-canvas.js';

function _isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const _MOVE_STEP       = 1;
const _MOVE_STEP_LARGE = 10;

// 키프레임 ref에서 현재 v/ease 읽기
function _readKey(doc, ref) {
  const prop = getProp(doc.layers[ref.id], ref.path);
  const kf = (prop?.keys ?? []).find(k => k.f === ref.f);
  // R18: 곡선 손잡이(sp)·커스텀 베지어(bezier)도 복사/붙여넣기에서 함께 보존.
  return kf ? { id: ref.id, path: ref.path, f: ref.f, v: kf.v, ease: kf.ease ?? 'linear', sp: kf.sp, bezier: kf.bezier } : null;
}

export function initKeys(store, editorState, getDragging = () => false, actions = {}) {
  // 복사 버퍼 (레이어 id 목록)
  let _clipboard = [];
  // 키프레임 복사 버퍼 [{id, path, f, v, ease}]
  let _kfClipboard = [];
  // 방향키 500ms merge 창
  let _arrowMergeTimer = null;
  let _canMergeArrow   = false;

  function _handler(e) {
    if (_isInputFocused()) return;
    // R23c: 메뉴 막대가 열려 있으면 다른 단축키가 같이 동작하지 않게 한다(메뉴가 Alt·화살표·Enter·Esc 를 처리).
    if (editorState.get().menuOpen) return;
    // 드래그(begin~commit) 진행 중엔 문서를 바꾸는 단축키를 무시한다.
    // (apply 가 예외를 던지거나 되돌리기 기록이 꼬이는 것을 막는다. Esc 는 drag.js 가 먼저 처리.)
    if (store.isBatching?.()) return;

    const es  = editorState.get();
    const doc = store.get();
    const { selection, f, autoKey } = es;
    const kfSel = es.kfSelection ?? [];
    const timelineFocus = es.focusRegion === 'timeline';

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

    // ── 루프 검사 도구 (F4-7) Ctrl+Shift+L ──────────────────────────────
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openLoopCheck(store, editorState);
      return;
    }

    // ── 그래프 편집기 전환 (R19) Shift+F3 ───────────────────────────────
    if (e.shiftKey && e.key === 'F3') {
      e.preventDefault();
      editorState.set({ graphMode: !es.graphMode });
      return;
    }

    // ── 키 보간 단축 (R19-3) — 타임라인·그래프 공통, 키 선택 대상 ────────
    // F9 "부드럽게"(both), Shift+F9(들어오는 쪽), Ctrl+Shift+F9(나가는 쪽)
    if (e.key === 'F9') {
      e.preventDefault();
      if (!kfSel.length) return;
      const mode = (ctrl && e.shiftKey) ? 'out' : (e.shiftKey ? 'in' : 'both');
      const cmds = easyEaseCommands(doc, kfSel, mode);
      if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      return;
    }
    // Ctrl+Alt+H: 정지 키(hold) 켜기/끄기
    if (ctrl && e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      if (!kfSel.length) return;
      const cmds = holdToggleCommands(doc, kfSel);
      if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      return;
    }

    // ── 그룹 만들기 / 풀기 (G3) ───────────────────────────────────────
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      ungroupSelection(store, editorState);
      return;
    }
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      groupSelection(store, editorState);
      return;
    }

    // ── 복사 / 붙여넣기 ────────────────────────────────────────────────
    // item 4: 타임라인 포커스 + 키 선택이면 키프레임 복사/붙여넣기
    if (ctrl && e.key.toLowerCase() === 'c' && timelineFocus && kfSel.length) {
      _kfClipboard = kfSel.map(r => _readKey(doc, r)).filter(Boolean);
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'v' && timelineFocus && _kfClipboard.length) {
      e.preventDefault();
      // 상대 간격 유지, 가장 이른 키를 재생선 위치에
      const minF = Math.min(..._kfClipboard.map(k => k.f));
      const fc   = doc.meta.frameCount ?? 1;
      const cmds = [];
      const newSel = [];
      for (const k of _kfClipboard) {
        const nf = Math.max(0, Math.min(fc - 1, f + (k.f - minF)));
        cmds.push({ type: 'setKey', id: k.id, path: k.path, f: nf, v: k.v, ease: k.ease, sp: k.sp, bezier: k.bezier });
        newSel.push({ id: k.id, path: k.path, f: nf });
      }
      if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      editorState.set({ kfSelection: newSel });
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'c') {
      _clipboard = selection.filter(id => doc.layers[id]);
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'v') {
      if (!_clipboard.length) return;
      e.preventDefault();
      const patches = store.apply({ type: 'duplicateLayers', ids: [..._clipboard] });
      // 최상위 복사본 id 추출 (parentId가 새 레이어가 아닌 것)
      const allNew = patches
        .filter(p => p.path.length === 2 && p.path[0] === 'layers' && p.before === undefined)
        .map(p => p.path[1]);
      const allNewSet = new Set(allNew);
      const topNew = allNew.filter(id => {
        const layer = store.get().layers[id];
        return layer && !allNewSet.has(layer.parentId ?? null);
      });
      if (topNew.length) editorState.set({ selection: topNew });
      return;
    }

    // ── 파일(새 장면 Ctrl+N · 가져오기 Ctrl+I) — 메뉴 막대와 같은 동작 ──────
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'n' && actions.onNewScene) {
      e.preventDefault(); actions.onNewScene(); return;
    }
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'i' && actions.onImport) {
      e.preventDefault(); actions.onImport(); return;
    }

    // ── 모두 선택 (Ctrl+A) — 최상위 레이어 전부 ─────────────────────────
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      editorState.set({ selection: (doc.order ?? []).filter((id) => doc.layers[id]) });
      return;
    }

    // ── 도구 전환 (V 옮기기 · E 편집 · P 움직이기 · H 손) ────────────────
    if (!ctrl && e.key.toLowerCase() === 'v') { editorState.set({ tool: 'select' }); return; }
    if (!ctrl && e.key.toLowerCase() === 'e') { editorState.set({ tool: 'edit' });   return; }
    if (!ctrl && e.key.toLowerCase() === 'p') { editorState.set({ tool: 'motion' }); return; }
    if (!ctrl && e.key.toLowerCase() === 'h') { editorState.set({ tool: 'hand' });   return; }
    if (!ctrl && e.key.toLowerCase() === 'z') { editorState.set({ tool: 'zoom' });   return; }

    // ── 그리드 토글 ────────────────────────────────────────────────────
    if (!ctrl && e.key.toLowerCase() === 'g') {
      editorState.set({ grid: !es.grid });
      return;
    }

    // ── 앞뒤 프레임 겹쳐 보기 토글 (R12-2) ──────────────────────────────
    if (!ctrl && e.key.toLowerCase() === 'o') {
      editorState.set({ onion: !es.onion });
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

    // ── 삭제 ───────────────────────────────────────────────────────────
    if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
      // item 3: 타임라인 포커스 + 키 선택이면 키프레임 삭제
      if (timelineFocus && kfSel.length) {
        e.preventDefault();
        const cmds = kfSel.map(r => ({ type: 'removeKey', id: r.id, path: r.path, f: r.f }));
        store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
        editorState.set({ kfSelection: [] });
        return;
      }
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
