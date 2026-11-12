// R20-A — 월드 변환 한 곳. 렌더(frame.js)와 UI(hit.js)가 모두 이 파일을 쓴다. DOM 없음.
//   계산 순서: 그룹 부모 체인 → 따라가기(follow) 대상 체인 → 자기 변형.
//   카메라는 여기서 다루지 않는다(frame.js·hit.js 가 leaf 에서 얹는다).
//   R22(그룹 시간)에서 프레임 변환이 들어올 수 있어 인자는 (doc, id, f, motions) 로 잡는다.
import { evalTransform } from './evaluate.js';
import { composeTransforms } from '../render/matrix.js';
import { innerFrame, localFrame } from './time.js';

const _IDENTITY = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };

// 따라가기 합성 — '진짜 부모'(애프터 이펙트 parent). 그룹(composeTransforms)은 피벗 모델이라
//   부모 평행이동이 자식에 전달되지 않지만, 따라가기는 대상이 움직이면 같이 움직여야 한다.
//   c(자기 변형)는 대상 로컬 프레임의 상대 오프셋으로 본다. 불투명도는 따라가지 않는다(c.alpha 만).
export function followCompose(P, c) {
  const rad = (P.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = P.scale ?? 1;
  const cx = c.x ?? 0, cy = c.y ?? 0;
  return {
    x: (P.x ?? 0) + s * (cx * cos - cy * sin),
    y: (P.y ?? 0) + s * (cx * sin + cy * cos),
    scale:  s * (c.scale ?? 1),
    scaleX: (P.scaleX ?? 1) * (c.scaleX ?? 1),
    scaleY: (P.scaleY ?? 1) * (c.scaleY ?? 1),
    rotation: (P.rotation ?? 0) + (c.rotation ?? 0),
    alpha: (c.alpha ?? 1),            // 따라가지 않는 것: 불투명도
    brightness: c.brightness, skewX: c.skewX, skewPivot: c.skewPivot, slices: c.slices, wrapX: c.wrapX, wrapY: c.wrapY,
  };
}

// 레이어의 '그룹 안 로컬' 변형(따라가기 체인 포함, 그룹 부모 제외).
//   A 가 B 를 따라가면(같은 그룹) A 로컬 = followCompose(B 로컬, A 자기 변형).
export function localWithFollow(doc, id, f, motions, _seen) {
  const layer = doc?.layers?.[id];
  if (!layer) return { ..._IDENTITY };
  const self = evalTransform(doc, id, f, motions);
  const fid = layer.followId;
  if (!fid || fid === id || !doc.layers[fid]) return self;
  const seen = _seen ?? new Set();
  if (seen.has(id)) return self;         // 순환 방어
  seen.add(id);
  const targetLocal = localWithFollow(doc, fid, f, motions, seen);
  return followCompose(targetLocal, self);
}

// 그룹 부모 체인을 타고 올라가 레이어 순서(root→self)로 반환.
function _parentChain(doc, id) {
  const chain = [];
  let cur = doc?.layers?.[id];
  while (cur) { chain.unshift(cur.id); if (!cur.parentId) break; cur = doc.layers[cur.parentId]; }
  return chain;
}

// 레이어의 문서 기준 최종 변형(카메라 제외).
//   R22b: f 는 항상 바깥(최상위) 프레임. 조상이 시간 그룹이면 자손의 프레임을 체인을 타고 변환한다.
//   조상에 시간이 없으면 fc 가 f 그대로라 결과는 기존과 비트 단위로 같다.
export function worldTr(doc, id, f, motions) {
  let tr = { ..._IDENTITY };
  let fc = f;
  const frameCount = doc?.meta?.frameCount;
  for (const cid of _parentChain(doc, id)) {
    tr = composeTransforms(tr, localWithFollow(doc, cid, fc, motions));
    const node = doc.layers[cid];
    if (node?.time) fc = innerFrame(node, fc, frameCount);   // 다음 자손은 안쪽 프레임으로
  }
  return tr;
}

// 레이어 '부모' 쪽 변형(그룹 부모 체인 + 따라가기 대상). 자기 evalTransform 를 이 위에 compose 하면 worldTr 이 된다.
//   화면/doc 좌표를 레이어 로컬 값으로 역변환할 때 공통으로 쓴다(카메라 제외).
export function parentWorldTr(doc, id, f, motions) {
  const layer = doc?.layers?.[id];
  if (!layer) return { ..._IDENTITY };
  let base = { ..._IDENTITY };
  if (layer.parentId) base = worldTr(doc, layer.parentId, f, motions);
  const fid = layer.followId;
  if (fid && fid !== id && doc.layers[fid]) {
    // 따라갈 대상(같은 그룹)은 이 레이어의 안쪽 로컬 프레임으로 평가한다.
    base = followCompose(base, localWithFollow(doc, fid, localFrame(doc, id, f), motions));
  }
  return base;
}
