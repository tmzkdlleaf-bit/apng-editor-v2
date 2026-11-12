// R21b — 가리기 점(레이어 자체 좌표, 왼쪽 위 0,0 px) ↔ 화면 변환 공용.
//   렌더(shape-mask + drawLeafWithFx)와 같은 좌표계를 쓴다. world.js(R20)·anchor 로 변환해
//   그룹 안·따라가기·카메라 상태에서도 맞다.
import { getDocWorldTr, worldToLocal } from './hit.js';
import { localToScreen, screenToDoc } from './transform.js';

// 레이어 내용 크기(cw,ch)와 앵커 비율(ax,ay). 렌더 drawLeafWithFx 의 dW/dH/ox/oy 와 일치해야 한다.
export function maskSpace(layer, doc, assets) {
  const ax = layer.anchor?.x ?? 0.5, ay = layer.anchor?.y ?? 0.5;
  if (layer.type === 'shape') {
    return { cw: layer.shape?.w ?? 100, ch: layer.shape?.h ?? 100, ax: 0.5, ay: 0.5 }; // 도형은 내용 중심이 앵커
  }
  if ((layer.type === 'image' || layer.type === 'anim') && assets) {
    const bm = layer.type === 'image' ? assets.getBitmap?.(layer.assetId) : assets.getAnimFrames?.(layer.assetId)?.frames?.[0];
    if (bm) return { cw: bm.width ?? bm.naturalWidth ?? 100, ch: bm.height ?? bm.naturalHeight ?? 100, ax, ay };
  }
  if (layer.type === 'effect' && layer.scope === 'box' && layer.box) {
    return { cw: layer.box.w ?? 100, ch: layer.box.h ?? 100, ax: 0.5, ay: 0.5 };
  }
  if (layer.type === 'effect') { // R28c: 화면 전체 효과 — 가리기 좌표 = 문서 좌표(왼쪽 위 0,0)
    return { cw: doc?.meta?.width ?? 200, ch: doc?.meta?.height ?? 200, ax: 0, ay: 0 };
  }
  return { cw: 200, ch: 200, ax, ay }; // text·그 밖은 근사
}

// 가리기 점(px) → 화면(CSS px). view = { zoom, panX, panY, W, H }.
export function maskPtToScreen(pt, layer, doc, f, view, assets) {
  const { cw, ch, ax, ay } = maskSpace(layer, doc, assets);
  const worldTr = getDocWorldTr(doc, layer.id, f);
  if (!worldTr) return null;
  return localToScreen(pt.x - cw * ax, pt.y - ch * ay, worldTr, view.zoom, view.panX, view.panY, view.W, view.H, doc.meta.width, doc.meta.height);
}

// 화면(CSS px) → 가리기 점(px).
export function screenToMaskPt(sx, sy, layer, doc, f, view, assets) {
  const { cw, ch, ax, ay } = maskSpace(layer, doc, assets);
  const worldTr = getDocWorldTr(doc, layer.id, f);
  if (!worldTr) return null;
  const d = screenToDoc(sx, sy, view.zoom, view.panX, view.panY, view.W, view.H, doc.meta.width, doc.meta.height);
  const loc = worldToLocal(d.x, d.y, worldTr);
  return { x: loc.x + cw * ax, y: loc.y + ch * ay };
}
