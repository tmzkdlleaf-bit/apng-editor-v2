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

// 평탄화된 가시 행 목록 반환
//   { kind:'camera' }
//   { kind:'layer', id, hasKeyedProps }
//   { kind:'prop', id, path, label }
export function computeRows(doc, expanded = {}) {
  const rows = [];

  if (cameraHasKeys(doc)) {
    rows.push({ kind: 'camera' });
  }

  const order = [...doc.order].reverse();
  for (const id of order) {
    const layer = doc.layers[id];
    if (!layer) continue;
    const kp = keyedProps(layer);
    rows.push({ kind: 'layer', id, hasKeyedProps: kp.length > 0 });
    if (expanded[id]) {
      for (const p of kp) {
        rows.push({ kind: 'prop', id, path: p.path, label: p.label });
      }
    }
  }

  return rows;
}
