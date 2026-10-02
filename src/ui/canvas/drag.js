import { hitTest } from './hit.js';
import { screenToDoc } from './transform.js';
import { computeSnap } from './snap.js';

// 레이어 정적 값(또는 현재 프레임 키프레임 값) 읽기
function _getPropValue(doc, layerId, propPath, f) {
  const parts = propPath.split('.');
  let cur = doc.layers[layerId];
  for (const k of parts) { if (cur == null) return 0; cur = cur[k]; }
  if (!cur) return 0;
  if (cur.keys?.length) {
    const key = [...cur.keys].reverse().find(k => k.f <= f);
    return key ? key.v : (cur.value ?? 0);
  }
  return cur.value ?? 0;
}

function _previewProp(store, id, path, value, f, hasKeys, autoKey) {
  const useF = (hasKeys || autoKey) ? f : undefined;
  store.preview({ type: 'setProp', id, path, value, f: useF });
}

function _hasPropKeys(doc, layerId, path) {
  const parts = path.split('.');
  let cur = doc.layers[layerId];
  for (const k of parts) { if (cur == null) return false; cur = cur[k]; }
  return !!(cur?.keys?.length);
}

export function initDrag(overlayCanvas, store, editorState, onSnapLines) {
  let _drag = null; // { layerId, type, origX, origY, origRot, startDocX, startDocY }

  function _canvasCoord(e) {
    const rect = overlayCanvas.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  }

  function _getViewInfo() {
    const es = editorState.get();
    const doc = store.get();
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    return { es, doc, W, H };
  }

  function _toDoc(cx, cy) {
    const { es, doc, W, H } = _getViewInfo();
    const { zoom, panX, panY } = es;
    return screenToDoc(cx, cy, zoom, panX, panY, W, H, doc.meta.width, doc.meta.height);
  }

  function _onPointerDown(e) {
    if (e.button !== 0) return;
    const es = editorState.get();
    if (es.tool !== 'select') return;

    const { cx, cy } = _canvasCoord(e);
    const doc = store.get();
    const { f, groupEdit } = es;
    const docPos = _toDoc(cx, cy);

    const layerId = hitTest(doc, docPos.x, docPos.y, f, groupEdit);
    if (!layerId) {
      editorState.set({ selection: [] });
      return;
    }

    // 더블클릭: 그룹 진입
    if (e.detail === 2 && doc.layers[layerId]?.type === 'group') {
      editorState.set({ groupEdit: layerId, selection: [] });
      return;
    }

    editorState.set({ selection: [layerId] });

    const origX = _getPropValue(doc, layerId, 'transform.x', f);
    const origY = _getPropValue(doc, layerId, 'transform.y', f);

    _drag = { layerId, origX, origY, startDocX: docPos.x, startDocY: docPos.y };
    overlayCanvas.setPointerCapture(e.pointerId);
    store.begin('이동');
    e.preventDefault();
  }

  function _onPointerMove(e) {
    if (!_drag) return;
    const { cx, cy } = _canvasCoord(e);
    const docPos = _toDoc(cx, cy);
    const { es, doc } = _getViewInfo();
    const { f, autoKey } = es;
    const { layerId, origX, origY, startDocX, startDocY } = _drag;

    let ddx = docPos.x - startDocX;
    let ddy = docPos.y - startDocY;

    // Shift: 축 고정
    if (e.shiftKey) {
      if (Math.abs(ddx) > Math.abs(ddy)) ddy = 0; else ddx = 0;
    }

    // 스냅
    const snapResult = computeSnap(
      origX + ddx, origY + ddy,
      doc, es, [layerId], e.altKey,
    );
    onSnapLines(snapResult.lines);

    const hasX = _hasPropKeys(doc, layerId, 'transform.x');
    const hasY = _hasPropKeys(doc, layerId, 'transform.y');
    _previewProp(store, layerId, 'transform.x', snapResult.x, f, hasX, autoKey);
    _previewProp(store, layerId, 'transform.y', snapResult.y, f, hasY, autoKey);
  }

  function _onPointerUp(e) {
    if (!_drag) return;
    store.commit();
    _drag = null;
    onSnapLines([]);
    overlayCanvas.releasePointerCapture(e.pointerId);
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape' && _drag) {
      store.cancel();
      _drag = null;
      onSnapLines([]);
    }
  }

  overlayCanvas.addEventListener('pointerdown', _onPointerDown);
  overlayCanvas.addEventListener('pointermove', _onPointerMove);
  overlayCanvas.addEventListener('pointerup', _onPointerUp);
  document.addEventListener('keydown', _onKeyDown);

  return () => {
    overlayCanvas.removeEventListener('pointerdown', _onPointerDown);
    overlayCanvas.removeEventListener('pointermove', _onPointerMove);
    overlayCanvas.removeEventListener('pointerup', _onPointerUp);
    document.removeEventListener('keydown', _onKeyDown);
  };
}
