// 타임라인 행 모델 — 레이어 목록(왼쪽)과 트랙 캔버스(오른쪽)가 공유
// 펼침 상태에 따라 레이어 행 + 키 있는 속성 하위 행 + 맨 위 카메라 행(키 있을 때만)
import { getEffect } from '../../effects/registry.js';

export const TRANSFORM_PROPS = [
  { path: 'transform.x',        label: '위치 X' },
  { path: 'transform.y',        label: '위치 Y' },
  { path: 'transform.scale',    label: '크기' },
  { path: 'transform.rotation', label: '회전' },
  { path: 'transform.alpha',    label: '불투명도' },
];

function _hasKeys(prop) {
  return !!(prop?.keys?.length);
}

// 카메라에 키프레임이 하나라도 있는지
export function cameraHasKeys(doc) {
  const cam = doc.camera;
  if (!cam) return false;
  return _hasKeys(cam.x) || _hasKeys(cam.y) || _hasKeys(cam.zoom);
}

// 레이어 transform에서 키가 있는 속성 목록
export function keyedProps(layer) {
  if (!layer?.transform) return [];
  return TRANSFORM_PROPS.filter(p => {
    const key = p.path.split('.')[1];
    return _hasKeys(layer.transform[key]);
  });
}

// keyedProps 를 일반화(R16-5): 키 있는 변형 5종 + 효과 레이어의 paramAnim 키.
//   라벨은 효과 정의의 label(없으면 키 이름). 경로는 'transform.x' · 'paramAnim.center'.
export function animatedProps(layer) {
  const out = keyedProps(layer);
  // 효과 레이어 자신의 수치 키(R16)
  if (layer?.type === 'effect' && layer.paramAnim && typeof layer.paramAnim === 'object') {
    const eff = getEffect(layer.effectId);
    const labelOf = (k) => (eff?.params ?? []).find(pd => pd.key === k)?.label ?? k;
    for (const key of Object.keys(layer.paramAnim)) {
      if (_hasKeys(layer.paramAnim[key])) out.push({ path: `paramAnim.${key}`, label: labelOf(key) });
    }
  }
  // 레이어에 쌓은 효과(fx)의 수치·섞기 키(R17). 라벨: 효과이름 › 파라미터
  if (layer?.fx && (layer.fxOrder?.length)) {
    for (const fxId of layer.fxOrder) {
      const fx = layer.fx[fxId];
      if (!fx) continue;
      const eff = getEffect(fx.effectId);
      const name = eff?.name ?? fx.effectId ?? '효과';
      const labelOf = (k) => (eff?.params ?? []).find(pd => pd.key === k)?.label ?? k;
      if (fx.paramAnim && typeof fx.paramAnim === 'object') {
        for (const key of Object.keys(fx.paramAnim)) {
          if (_hasKeys(fx.paramAnim[key])) out.push({ path: `fx.${fxId}.paramAnim.${key}`, label: `${name} › ${labelOf(key)}` });
        }
      }
      if (_hasKeys(fx.mix)) out.push({ path: `fx.${fxId}.mix`, label: `${name} › 섞기` });
    }
  }
  // R22b: 그룹/인스턴스 시간 다시 매기기(time.remap) — 켜져 있으면 줄로 보인다.
  if (layer?.time && layer.time.remap && _hasKeys(layer.time.remap)) {
    out.push({ path: 'time.remap', label: '시간 다시 매기기', remap: true });
  }
  // R21: 펜/도형 가리기(masks)의 모양·흐림·넓히기·불투명도 키
  if (layer?.masks && Array.isArray(layer.masks.order)) {
    const MK = [['path', '모양'], ['feather', '흐림'], ['expand', '넓히기'], ['opacity', '불투명도']];
    for (const mid of layer.masks.order) {
      const it = layer.masks.items?.[mid];
      if (!it) continue;
      for (const [key, klabel] of MK) {
        if (_hasKeys(it[key])) out.push({ path: `masks.items.${mid}.${key}`, label: `${it.name ?? '가리기'} › ${klabel}` });
      }
    }
  }
  return out;
}

// 평탄화된 가시 행 목록 반환 (그룹 계층 재귀, depth 포함)
//   { kind:'camera', depth }
//   { kind:'layer', id, depth, hasKeyedProps, isGroup, hasChildren, hasExpandable }
//   { kind:'prop', id, path, label, depth }
export function computeRows(doc, expanded = {}) {
  const rows = [];

  // 카메라 행은 키프레임이 있을 때 표시(키를 넣으면 트랙에서 스크럽). 카메라 편집 진입은
  // 레이어 머리 칸의 "카메라" 버튼(editorState.cameraActive)으로 — 트랙 레이아웃을 바꾸지 않는다.
  if (cameraHasKeys(doc)) {
    rows.push({ kind: 'camera', depth: 0 });
  }

  function walk(order, depth) {
    // 표시 순서는 역순 (맨 위 레이어가 목록 위)
    for (const id of [...order].reverse()) {
      const layer = doc.layers[id];
      if (!layer) continue;
      const kp        = animatedProps(layer);
      const isGroup   = layer.type === 'group';
      const childOrder = isGroup ? (layer.childOrder ?? []) : [];
      const hasChildren = childOrder.length > 0;
      const hasExpandable = kp.length > 0 || hasChildren;

      rows.push({
        kind: 'layer', id, depth,
        hasKeyedProps: kp.length > 0,
        isGroup, hasChildren, hasExpandable,
      });

      if (expanded[id]) {
        // 키 있는 속성 하위 행이 자식 행보다 먼저 (G1)
        for (const p of kp) {
          rows.push({ kind: 'prop', id, path: p.path, label: p.label, depth: depth + 1, remap: !!p.remap });
        }
        if (hasChildren) walk(childOrder, depth + 1);
      }
    }
  }

  walk(doc.order, 0);
  return rows;
}

// layerId가 ancestorId 자신이거나 그 자손이면 true (드롭 금지 판정용)
export function isSelfOrDescendant(doc, ancestorId, layerId) {
  if (!ancestorId || !layerId) return false;
  if (ancestorId === layerId) return true;
  const group = doc.layers[ancestorId];
  if (group?.type !== 'group') return false;
  for (const childId of (group.childOrder ?? [])) {
    if (isSelfOrDescendant(doc, childId, layerId)) return true;
  }
  return false;
}
