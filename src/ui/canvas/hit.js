import { evalCamera } from '../../core/anim/evaluate.js';
import { localWithFollow, worldTr as worldTrOf } from '../../core/anim/world.js';
import { localFrame } from '../../core/anim/time.js';
import { composeTransforms, applyCamera, cameraScreenTr } from '../../core/render/matrix.js';
import { measureTextBounds } from '../../core/render/layers/text.js';
import motionRegistry from '../../motions/registry.js';

const _IDENTITY = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };

// R8-1: 카메라는 가운데 축척+이동 아핀(회전 0). 합성 부모가 아니라 문서 월드에 얹는 affine 이다.
//   최상위 레이어의 '부모'로 쓸 때는 이 아핀 객체(_cam 표시)를 돌려주고, 역변환은 affine 역으로 한다.
function _cameraParentTr(doc, f) {
  const cam = evalCamera(doc, f);
  const { z, tx, ty } = cameraScreenTr(cam, doc.meta.width, doc.meta.height);
  return { x: tx, y: ty, scale: z, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, _cam: true };
}

// opts.camera=false 면 카메라 없는 '문서(raw) 단위' 월드. 기본(true)은 카메라 포함(화면/히트/기즈모용).
// 렌더(frame.js)와 같은 모델: 문서 단위로 합성한 뒤 카메라 아핀을 얹는다.
export function getDocWorldTr(doc, layerId, f, opts = {}) {
  const layer = doc.layers[layerId];
  if (!layer) return null;

  // R20-A: 월드 변환은 world.js 한 곳에서(그룹 부모 체인 + 따라가기 체인 + 자기 변형).
  let tr = worldTrOf(doc, layerId, f, motionRegistry);
  if (opts.camera !== false) {
    tr = applyCamera(tr, cameraScreenTr(evalCamera(doc, f), doc.meta.width, doc.meta.height));
  }
  return tr;
}

// 레이어의 '부모' 월드 변환. 자식은 부모 체인(카메라 포함), 최상위는 카메라 아핀을 부모로 본다.
// 화면/_toDoc 좌표(카메라 월드)를 레이어 로컬 값(transform.x/y)으로 역변환할 때 공통으로 쓴다.
// R20-B: 따라가기(followId)가 있으면 대상 로컬을 부모 프레임에 얹는다(같은 그룹 제약).
export function getParentWorldTr(doc, layerId, f) {
  const layer = doc.layers[layerId];
  if (!layer) return null;
  const fid = layer.followId;
  if (!layer.parentId && !fid) return _cameraParentTr(doc, f);
  let base = layer.parentId ? getDocWorldTr(doc, layer.parentId, f) : _cameraParentTr(doc, f);
  if (fid && fid !== layerId && doc.layers[fid]) {
    // R22b: 따라갈 대상은 이 레이어의 안쪽 로컬 프레임으로 평가(시간 그룹 밖이면 f 그대로).
    base = composeTransforms(base, localWithFollow(doc, fid, localFrame(doc, layerId, f), motionRegistry));
  }
  return base;
}

// parentTr 안의 로컬 좌표 → 월드 좌표(worldToLocalInParent 의 정변환). R18 손잡이 위치 계산.
export function localToWorldInParent(localX, localY, parentTr) {
  if (!parentTr) return { x: localX, y: localY };
  if (parentTr._cam) {
    const s = parentTr.scale ?? 1;
    return { x: localX * s + (parentTr.x ?? 0), y: localY * s + (parentTr.y ?? 0) };
  }
  const rad = (parentTr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = parentTr.scale ?? 1;
  const lx = (localX - (parentTr.x ?? 0)) * s;
  const ly = (localY - (parentTr.y ?? 0)) * s;
  return {
    x: (parentTr.x ?? 0) + (lx * cos - ly * sin),
    y: (parentTr.y ?? 0) + (lx * sin + ly * cos),
  };
}

// 월드 좌표 → parentTr 안의 로컬 transform 값으로 역변환.
// 카메라 아핀(_cam)이면 화면=z·local+T 의 역(회전 0): local=(world−T)/z.
// 그 외(그룹 등)는 피벗 모델: composeTransforms(parentTr, { x }) === world 를 만족하는 x.
export function worldToLocalInParent(worldX, worldY, parentTr) {
  if (!parentTr) return { x: worldX, y: worldY };
  if (parentTr._cam) {
    const s = parentTr.scale ?? 1;
    return { x: (worldX - (parentTr.x ?? 0)) / s, y: (worldY - (parentTr.y ?? 0)) / s };
  }
  const rad = (parentTr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = parentTr.scale ?? 1;
  const dx = worldX - (parentTr.x ?? 0);
  const dy = worldY - (parentTr.y ?? 0);
  return {
    x: (parentTr.x ?? 0) + (dx * cos + dy * sin) / s,
    y: (parentTr.y ?? 0) + (dy * cos - dx * sin) / s,
  };
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
    // renderer와 동일한 실측값·정렬 기준점 사용(measureTextBounds export).
    // 정렬에 따라 상자 중심이 앵커에서 벗어나므로 ox/oy 를 그대로 쓴다.
    const bounds = measureTextBounds(layer);
    return { hw: bounds.w / 2, hh: bounds.h / 2, ox: bounds.ox ?? 0, oy: bounds.oy ?? 0 };
  } else if (type === 'image' || type === 'anim') {
    if (assets) {
      const bm = type === 'image'
        ? assets.getBitmap?.(layer.assetId)
        : assets.getAnimFrames?.(layer.assetId)?.frames?.[0];
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

// 월드(doc, 카메라 포함) 좌표 → worldTr 로컬 콘텐츠 좌표(±hw, ±hh). 회전·전체 scale·가로세로 보정을 되돌린다.
export function worldToLocal(worldX, worldY, worldTr) {
  const dx = worldX - (worldTr.x ?? 0);
  const dy = worldY - (worldTr.y ?? 0);
  const rad = -(worldTr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = worldTr.scale ?? 1;
  // 가로·세로 보정까지 되돌려 레이어 콘텐츠 좌표(±hw, ±hh)로 판정.
  const sx = s * (worldTr.scaleX ?? 1);
  const sy = s * (worldTr.scaleY ?? 1);
  return {
    x: (dx * cos - dy * sin) / sx,
    y: (dx * sin + dy * cos) / sy,
  };
}
const _worldToLocal = worldToLocal;

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
