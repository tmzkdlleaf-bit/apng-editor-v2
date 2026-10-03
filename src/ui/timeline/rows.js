// 타임라인 행 모델 — 레이어 목록(왼쪽)과 트랙 캔버스(오른쪽)가 공유
// 펼침 상태에 따라 레이어 행 + 키 있는 속성 하위 행 + 맨 위 카메라 행(키 있을 때만)

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

// 평탄화된 가시 행 목록 반환 (그룹 계층 재귀, depth 포함)
//   { kind:'camera', depth }
//   { kind:'layer', id, depth, hasKeyedProps, isGroup, hasChildren, hasExpandable }
//   { kind:'prop', id, path, label, depth }
export function computeRows(doc, expanded = {}) {
  const rows = [];

  if (cameraHasKeys(doc)) {
    rows.push({ kind: 'camera', depth: 0 });
  }

  function walk(order, depth) {
    // 표시 순서는 역순 (맨 위 레이어가 목록 위)
    for (const id of [...order].reverse()) {
      const layer = doc.layers[id];
      if (!layer) continue;
      const kp        = keyedProps(layer);
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
          rows.push({ kind: 'prop', id, path: p.path, label: p.label, depth: depth + 1 });
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
