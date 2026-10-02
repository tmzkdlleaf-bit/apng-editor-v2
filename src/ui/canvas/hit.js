import { evalTransform } from '../../core/anim/evaluate.js';
import { composeTransforms } from '../../core/render/matrix.js';
import { measureTextBounds } from '../../core/render/layers/text.js';

export function getDocWorldTr(doc, layerId, f) {
  const layer = doc.layers[layerId];
  if (!layer) return null;

  const chain = [];
  let cur = layer;
  while (cur) {
    chain.unshift(cur.id);
    if (!cur.parentId) break;
    cur = doc.layers[cur.parentId];
  }

  let tr = { x: 0, y: 0, scale: 1, rotation: 0, alpha: 1 };
  for (const id of chain) {
    const localTr = evalTransform(doc, id, f, null);
    tr = composeTransforms(tr, localTr);
  }
  return tr;
}

// 레이어 반폭/반높이 + anchor 오프셋 (ox, oy)
// assets 제공 시 image/anim 실제 비트맵 크기 사용, 없으면 null 반환 (판정 없음)
// assets 미제공 시 기본값 사용 (기즈모 등 표시용)
export function getLayerBounds(layer, assets) {
  const type = layer.type;
  const ax = layer.anchor?.x ?? 0.5;
  const ay = layer.anchor?.y ?? 0.5;

  let w, h;

  if (type === 'shape') {
    w = layer.shape?.w ?? 100;
    h = layer.shape?.h ?? 100;
  } else if (type === 'text') {
    // renderer와 동일한 추정값 사용 (measureTextBounds export)
    const bounds = measureTextBounds(layer);
    w = bounds.w; h = bounds.h;
  } else if (type === 'image' || type === 'anim') {
    if (assets) {
      const bm = type === 'image'
        ? assets.getBitmap?.(layer.assetId)
        : assets.getAnimFrames?.(layer.assetId)?.[0];
      if (!bm) return null;
      w = bm.width ?? bm.naturalWidth ?? 0;
      h = bm.height ?? bm.naturalHeight ?? 0;
      if (!w || !h) return null;
    } else {
      // assets 없음 (기즈모 표시용 폴백)
      w = 100; h = 100;
    }
  } else if (type === 'effect') {
    if (layer.scope === 'box' && layer.box) {
      w = layer.box.w ?? 100;
      h = layer.box.h ?? 100;
    } else {
      return null; // scope=full: 선택 불가
    }
  } else if (type === 'group') {
    return null; // hitTest에서 자식 재귀 처리
  } else {
    w = 100; h = 100;
  }

  return {
    hw: w / 2,
    hh: h / 2,
    ox: (0.5 - ax) * w,
    oy: (0.5 - ay) * h,
  };
}

function _worldToLocal(worldX, worldY, worldTr) {
  const dx = worldX - (worldTr.x ?? 0);
  const dy = worldY - (worldTr.y ?? 0);
  const rad = -(worldTr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = worldTr.scale ?? 1;
  return {
    x: (dx * cos - dy * sin) / s,
    y: (dx * sin + dy * cos) / s,
  };
}

function _hitGroupChildren(doc, groupId, docX, docY, f, assets) {
  const group = doc.layers[groupId];
  if (!group) return false;
  const children = group.childOrder ?? [];
  for (let i = children.length - 1; i >= 0; i--) {
    const cid = children[i];
    const child = doc.layers[cid];
    if (!child || child.visible === false) continue;
    if (child.type === 'effect' && (!child.scope || child.scope === 'full')) continue;
    if (child.type === 'group') {
      if (_hitGroupChildren(doc, cid, docX, docY, f, assets)) return true;
      continue;
    }
    const worldTr = getDocWorldTr(doc, cid, f);
    if (!worldTr) continue;
    const bounds = getLayerBounds(child, assets);
    if (!bounds) continue;
    const local = _worldToLocal(docX, docY, worldTr);
    if (Math.abs(local.x - (bounds.ox ?? 0)) <= bounds.hw && Math.abs(local.y - (bounds.oy ?? 0)) <= bounds.hh) return true;
  }
  return false;
}

// assets: { getBitmap, getAnimFrames } (선택) — image/anim 실제 비트맵 크기 판정용
export function hitTest(doc, docX, docY, f, groupEditId = null, assets = null) {
  const order = groupEditId
    ? (doc.layers[groupEditId]?.childOrder ?? [])
    : doc.order;

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const layer = doc.layers[id];
    if (!layer || layer.visible === false || layer.locked) continue;

    if (layer.type === 'effect' && (!layer.scope || layer.scope === 'full')) continue;

    if (layer.type === 'group' && !groupEditId) {
      if (_hitGroupChildren(doc, id, docX, docY, f, assets)) return id;
      continue;
    }

    const worldTr = getDocWorldTr(doc, id, f);
    if (!worldTr) continue;
    const bounds = getLayerBounds(layer, assets);
    if (!bounds) continue;
    const local = _worldToLocal(docX, docY, worldTr);
    if (Math.abs(local.x - (bounds.ox ?? 0)) <= bounds.hw && Math.abs(local.y - (bounds.oy ?? 0)) <= bounds.hh) return id;
  }
  return null;
}
