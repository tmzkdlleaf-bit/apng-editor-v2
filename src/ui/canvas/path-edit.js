// 모션 경로 키 점 끌기(F3-4) — 편집 모드(tool='edit')에서 경로 위 키프레임 점을 끌면
// 그 키 값만 수정(기록 1건). 보조 캔버스(overlay)에서 포인터를 받는다.
import { screenToDoc, docToScreen } from './transform.js';
import { evalProp } from '../../core/anim/prop.js';
import { motionPathKeyFrames } from './gizmo.js';

const HIT = 8; // 점 히트 반경(px)

// 경로 직선화(F3-4) — 중간 키들을 시작→끝 직선 위로. 기록 1건.
export function straightenPath(store, layerId) {
  const doc = store.get();
  const layer = doc.layers[layerId];
  if (!layer) return;
  const keyFs = motionPathKeyFrames(layer);
  if (keyFs.length < 3) return; // 중간 키가 있어야 의미
  const px = layer.transform.x, py = layer.transform.y;
  const f0 = keyFs[0], fN = keyFs[keyFs.length - 1];
  const x0 = evalProp(px, f0), y0 = evalProp(py, f0);
  const xN = evalProp(px, fN), yN = evalProp(py, fN);
  const cmds = [];
  for (const f of keyFs) {
    if (f === f0 || f === fN) continue;
    const t = (f - f0) / (fN - f0);
    if ((px.keys ?? []).some(k => k.f === f)) cmds.push({ type: 'setProp', id: layerId, path: 'transform.x', value: x0 + (xN - x0) * t, f });
    if ((py.keys ?? []).some(k => k.f === f)) cmds.push({ type: 'setProp', id: layerId, path: 'transform.y', value: y0 + (yN - y0) * t, f });
  }
  if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
}

export function initPathEdit(overlayCanvas, store, editorState) {
  let _drag = null; // { id, f, hasX, hasY }

  function _cssSize() { const r = overlayCanvas.getBoundingClientRect(); return { W: r.width, H: r.height, rect: r }; }
  function _toScreen(docX, docY) {
    const es = editorState.get(); const doc = store.get(); const { W, H } = _cssSize();
    return docToScreen(docX, docY, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }
  function _toDoc(cx, cy) {
    const es = editorState.get(); const doc = store.get(); const { W, H } = _cssSize();
    return screenToDoc(cx, cy, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }

  function _hitKey(cx, cy) {
    const es = editorState.get(); const doc = store.get();
    if (es.selection.length !== 1) return null;
    const layer = doc.layers[es.selection[0]];
    if (!layer) return null;
    const px = layer.transform.x, py = layer.transform.y;
    for (const f of motionPathKeyFrames(layer)) {
      const s = _toScreen(evalProp(px, f), evalProp(py, f));
      if ((s.x - cx) ** 2 + (s.y - cy) ** 2 <= HIT * HIT) {
        return { id: layer.id, f, hasX: (px.keys ?? []).some(k => k.f === f), hasY: (py.keys ?? []).some(k => k.f === f) };
      }
    }
    return null;
  }

  function _onDown(e) {
    if (editorState.get().tool !== 'edit') return;
    const rect = overlayCanvas.getBoundingClientRect();
    const hit = _hitKey(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    _drag = hit;
    overlayCanvas.setPointerCapture?.(e.pointerId);
    store.begin('경로 점');
  }
  function _onMove(e) {
    if (!_drag) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const d = _toDoc(e.clientX - rect.left, e.clientY - rect.top);
    const cmds = [];
    if (_drag.hasX) cmds.push({ type: 'setProp', id: _drag.id, path: 'transform.x', value: d.x, f: _drag.f });
    if (_drag.hasY) cmds.push({ type: 'setProp', id: _drag.id, path: 'transform.y', value: d.y, f: _drag.f });
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _onUp(e) {
    if (!_drag) return;
    _drag = null;
    overlayCanvas.releasePointerCapture?.(e.pointerId);
    store.commit();
  }

  // capture 단계에서 먼저 받아, 편집 모드 경로 점이면 일반 드래그보다 우선.
  overlayCanvas.addEventListener('pointerdown', _onDown, true);
  overlayCanvas.addEventListener('pointermove', _onMove, true);
  overlayCanvas.addEventListener('pointerup', _onUp, true);
  overlayCanvas.addEventListener('pointercancel', _onUp, true);

  function destroy() {
    overlayCanvas.removeEventListener('pointerdown', _onDown, true);
    overlayCanvas.removeEventListener('pointermove', _onMove, true);
    overlayCanvas.removeEventListener('pointerup', _onUp, true);
    overlayCanvas.removeEventListener('pointercancel', _onUp, true);
  }
  return { destroy, isDragging: () => !!_drag };
}
