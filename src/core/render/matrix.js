// 2D 아핀 행렬 [a, b, c, d, tx, ty] (표준 DOMMatrix 파라미터 순서)
// transform(a, b, c, d, e, f): x' = ax + cy + e, y' = bx + dy + f

export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

// A * B (A 먼저 적용, B 그 위에)
export function multiply(A, B) {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

export function applyToCtx(ctx, m) {
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

// 레이어 변환: x/y는 캔버스 중심으로부터의 오프셋
export function layerMatrix(tr, canvasW, canvasH) {
  const rad = (tr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s   = tr.scale ?? 1;
  const tx  = canvasW / 2 + (tr.x ?? 0);
  const ty  = canvasH / 2 + (tr.y ?? 0);
  return [s * cos, s * sin, -s * sin, s * cos, tx, ty];
}

// 카메라 행렬: T(cx,cy) * S(zoom) * T(-cx+camX, -cy+camY)
export function cameraMatrix(cam, width, height) {
  const cx   = width  / 2;
  const cy   = height / 2;
  const zoom = cam.zoom ?? 1;
  const tx   = cx * (1 - zoom) + zoom * (cam.x ?? 0);
  const ty   = cy * (1 - zoom) + zoom * (cam.y ?? 0);
  return [zoom, 0, 0, zoom, tx, ty];
}

// 부모→자식 변환 합성 (두 evalTransform 결과 합성)
// 자식의 x/y는 부모 로컬 좌표계 기준 오프셋.
// pivot 없음(부모 원점 = 부모의 canvas center 위치).
export function composeTransforms(parent, child) {
  const rad = (parent.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s   = parent.scale  ?? 1;
  const cx  = child.x       ?? 0;
  const cy  = child.y       ?? 0;

  return {
    x:        (parent.x        ?? 0) + s * (cx * cos - cy * sin),
    y:        (parent.y        ?? 0) + s * (cx * sin + cy * cos),
    scale:    s * (child.scale    ?? 1),
    rotation: (parent.rotation ?? 0) + (child.rotation ?? 0),
    alpha:    (parent.alpha    ?? 1) * (child.alpha    ?? 1),
  };
}
