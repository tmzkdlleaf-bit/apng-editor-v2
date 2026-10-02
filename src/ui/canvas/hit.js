import { evalTransform } from '../../core/anim/evaluate.js';
import { composeTransforms } from '../../core/render/matrix.js';

// 레이어의 문서 공간 worldTr (카메라 제외, 부모 포함)
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

// 레이어 로컬 공간 기준 반폭/반높이
// null: 선택 불가 (effect scope=full, group은 자식 재귀로 처리)
export function getLayerBounds(layer) {
  const type = layer.type;
  if (type === 'shape') {
    return { hw: (layer.shape?.w ?? 100) / 2, hh: (layer.shape?.h ?? 100) / 2 };
  }
  if (type === 'text') {
    const sz = layer.size ?? 48;
    const lines = String(layer.text ?? '').split('\n');
    const maxLen = Math.max(1, ...lines.map(l => l.length));
    return {
      hw: sz * 1.8 * maxLen / 2,
      hh: lines.length * sz * (layer.lineHeight ?? 1.2) / 2,
    };
  }
  if (type === 'image' || type === 'anim') {
    return { hw: (layer.w ?? 100) / 2, hh: (layer.h ?? 100) / 2 };
  }
  if (type === 'effect') {
    if (layer.scope === 'box' && layer.box) {
      return { hw: (layer.box.w ?? 100) / 2, hh: (layer.box.h ?? 100) / 2 };
    }
    return null; // scope=full: 선택 불가
  }
  if (type === 'group') {
    return null; // hitTest에서 자식 재귀 처리
  }
  return { hw: 50, hh: 50 };
}

// worldTr 역변환: 문서 좌표 → 레이어 로컬 좌표
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

// 그룹 자식 재귀 히트 검사 (그룹 id 반환하지 않고 hit 여부만)
function _hitGroupChildren(doc, groupId, docX, docY, f) {
  const group = doc.layers[groupId];
  if (!group) return false;
  const children = group.childOrder ?? [];
  for (let i = children.length - 1; i >= 0; i--) {
    const cid = children[i];
    const child = doc.layers[cid];
    if (!child || child.visible === false) continue;
    if (child.type === 'effect' && (!child.scope || child.scope === 'full')) continue;
    if (child.type === 'group') {
      if (_hitGroupChildren(doc, cid, docX, docY, f)) return true;
      continue;
    }
    const worldTr = getDocWorldTr(doc, cid, f);
    if (!worldTr) continue;
    const bounds = getLayerBounds(child);
    if (!bounds) continue;
    const local = _worldToLocal(docX, docY, worldTr);
    if (Math.abs(local.x) <= bounds.hw && Math.abs(local.y) <= bounds.hh) return true;
  }
  return false;
}

// doc 공간의 점 (docX, docY)에서 최상위 레이어 id 반환
// groupEditId: 그룹 편집 중이면 해당 그룹 id
export function hitTest(doc, docX, docY, f, groupEditId = null) {
  const order = groupEditId
    ? (doc.layers[groupEditId]?.childOrder ?? [])
    : doc.order;

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const layer = doc.layers[id];
    if (!layer || layer.visible === false || layer.locked) continue;

    // effect scope=full: 선택 불가
    if (layer.type === 'effect' && (!layer.scope || layer.scope === 'full')) continue;

    // 그룹: 자식을 재귀적으로 확인 (그룹 편집 외부에서만)
    if (layer.type === 'group' && !groupEditId) {
      if (_hitGroupChildren(doc, id, docX, docY, f)) return id;
      continue;
    }

    const worldTr = getDocWorldTr(doc, id, f);
    if (!worldTr) continue;
    const bounds = getLayerBounds(layer);
    if (!bounds) continue;
    const local = _worldToLocal(docX, docY, worldTr);
    if (Math.abs(local.x) <= bounds.hw && Math.abs(local.y) <= bounds.hh) return id;
  }
  return null;
}
