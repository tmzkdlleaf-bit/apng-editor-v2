// 이펙트 coord 파라미터(위치·중심)를 캔버스에서 끌기(R12-1).
// 편집 도구(E)에서만 보이고 끌 수 있다(옮기기 도구의 레이어 이동과 겹치지 않게).
//
// 좌표 모델(렌더 effect.js 와 일치):
//   coord 값은 효과 영역 기준 0~1 비율이다. 효과는 내부에서 cx=coord.x*w, cy=coord.y*h 로 그린다.
//   scope=box: 효과 상자(ew×eh, doc 단위) 중심 원점에 그린 뒤 worldTr(위치·회전·크기·카메라)로 블리팅
//     → 화면 = localToScreen((coord.x−0.5)*ew, (coord.y−0.5)*eh, worldTr).
//   scope=full: 효과 내용이 문서 좌표에 그려지고 worldTr.x/y 만큼 이동한다. 렌더(frame.js:219)는
//     full 이펙트에 카메라(applyCamera)를 얹지 않으므로 여기서도 카메라를 뺀 worldTr 을 쓴다.
//     → 화면 = docToScreen(coord.x*docW + worldTr.x, coord.y*docH + worldTr.y).
// 값은 0~1로 자르지 않는다(화면 밖 배치 허용).
import { docToScreen, screenToDoc, localToScreen } from './transform.js';
import { getDocWorldTr, worldToLocal } from './hit.js';
import { getEffect } from '../../effects/registry.js';

const HIT = 9; // 점 히트 반경(px)

// 효과 레이어의 coord 파라미터 목록 [{ key, label, value:{x,y} }].
export function effectCoordParams(doc, layerId) {
  const layer = doc.layers?.[layerId];
  if (!layer || layer.type !== 'effect') return [];
  const effect = getEffect(layer.effectId);
  if (!effect) return [];
  const out = [];
  for (const pd of (effect.params ?? [])) {
    if (pd.type !== 'coord') continue;
    const raw = (layer.params ?? {})[pd.key];
    const v = (raw && typeof raw === 'object') ? raw : (pd.default ?? { x: 0.5, y: 0.5 });
    out.push({ key: pd.key, label: pd.label ?? pd.key, value: { x: v.x ?? 0.5, y: v.y ?? 0.5 } });
  }
  return out;
}

function _effectSize(layer, doc) {
  if ((layer.scope ?? 'full') === 'box' && layer.box) {
    return { w: Math.max(1, layer.box.w ?? 100), h: Math.max(1, layer.box.h ?? 100), box: true };
  }
  return { w: doc.meta.width, h: doc.meta.height, box: false };
}

// coord(0~1) → 화면(CSS px).
export function coordToScreen(coord, layer, doc, f, zoom, panX, panY, W, H) {
  const { width: docW, height: docH } = doc.meta;
  const { w: ew, h: eh, box } = _effectSize(layer, doc);
  if (box) {
    const worldTr = getDocWorldTr(doc, layer.id, f); // box: 카메라 포함
    if (!worldTr) return null;
    return localToScreen((coord.x - 0.5) * ew, (coord.y - 0.5) * eh, worldTr, zoom, panX, panY, W, H, docW, docH);
  }
  const worldTr = getDocWorldTr(doc, layer.id, f, { camera: false }); // full: 카메라 없음(렌더와 일치)
  if (!worldTr) return null;
  return docToScreen(coord.x * docW + (worldTr.x ?? 0), coord.y * docH + (worldTr.y ?? 0), zoom, panX, panY, W, H, docW, docH);
}

// 화면(CSS px) → coord(0~1, 자르지 않음).
export function screenToCoord(sx, sy, layer, doc, f, zoom, panX, panY, W, H) {
  const { width: docW, height: docH } = doc.meta;
  const { w: ew, h: eh, box } = _effectSize(layer, doc);
  const d = screenToDoc(sx, sy, zoom, panX, panY, W, H, docW, docH);
  if (box) {
    const worldTr = getDocWorldTr(doc, layer.id, f);
    if (!worldTr) return null;
    const loc = worldToLocal(d.x, d.y, worldTr);
    return { x: loc.x / ew + 0.5, y: loc.y / eh + 0.5 };
  }
  const worldTr = getDocWorldTr(doc, layer.id, f, { camera: false });
  if (!worldTr) return null;
  return { x: (d.x - (worldTr.x ?? 0)) / docW, y: (d.y - (worldTr.y ?? 0)) / docH };
}

// 편집 도구에서 coord 점을 끌어 값을 바꾼다(begin→preview→commit = 되돌리기 1건). path-edit 와 같은 패턴.
export function initEffectCoordEdit(overlayCanvas, store, editorState) {
  let _drag = null; // { id, key }

  function _cssSize() { const r = overlayCanvas.getBoundingClientRect(); return { W: r.width, H: r.height }; }

  function _selectedEffect() {
    const es = editorState.get();
    if ((es.tool !== 'edit' && es.tool !== 'select') || es.selection.length !== 1) return null; // R32: 옮기기 도구에서도 위치 점을 끈다
    const doc = store.get();
    const layer = doc.layers[es.selection[0]];
    return (layer && layer.type === 'effect') ? layer : null;
  }

  function _hit(cx, cy) {
    const layer = _selectedEffect();
    if (!layer) return null;
    const es = editorState.get();
    const doc = store.get();
    const { W, H } = _cssSize();
    for (const c of effectCoordParams(doc, layer.id)) {
      const s = coordToScreen(c.value, layer, doc, es.f, es.zoom, es.panX, es.panY, W, H);
      if (s && (s.x - cx) ** 2 + (s.y - cy) ** 2 <= HIT * HIT) return { id: layer.id, key: c.key };
    }
    return null;
  }

  function _setCoord(id, key, coord, preview) {
    const doc = store.get();
    const params = { ...(doc.layers[id]?.params ?? {}), [key]: { x: coord.x, y: coord.y } };
    const cmd = { type: 'setLayer', id, patch: { params } };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  function _onDown(e) {
    if (e.button !== 0) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const hit = _hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    _drag = hit;
    overlayCanvas.setPointerCapture?.(e.pointerId);
    store.begin('효과 위치');
  }
  function _onMove(e) {
    if (!_drag) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const es = editorState.get();
    const doc = store.get();
    const { W, H } = _cssSize();
    const layer = doc.layers[_drag.id];
    if (!layer) return;
    const coord = screenToCoord(e.clientX - rect.left, e.clientY - rect.top, layer, doc, es.f, es.zoom, es.panX, es.panY, W, H);
    if (coord) _setCoord(_drag.id, _drag.key, coord, true);
  }
  function _onUp(e) {
    if (!_drag) return;
    _drag = null;
    overlayCanvas.releasePointerCapture?.(e.pointerId);
    store.commit();
  }
  function _onCancel() { if (_drag) { _drag = null; store.cancel(); } }

  // capture 단계에서 먼저 받아, 편집 모드 coord 점이면 일반 드래그보다 우선(path-edit 와 같은 방식).
  overlayCanvas.addEventListener('pointerdown', _onDown, true);
  overlayCanvas.addEventListener('pointermove', _onMove, true);
  overlayCanvas.addEventListener('pointerup', _onUp, true);
  overlayCanvas.addEventListener('pointercancel', _onCancel, true);

  function destroy() {
    overlayCanvas.removeEventListener('pointerdown', _onDown, true);
    overlayCanvas.removeEventListener('pointermove', _onMove, true);
    overlayCanvas.removeEventListener('pointerup', _onUp, true);
    overlayCanvas.removeEventListener('pointercancel', _onCancel, true);
  }
  return { destroy, isDragging: () => !!_drag };
}
