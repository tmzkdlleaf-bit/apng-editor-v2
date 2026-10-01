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

// ctx에 worldTr 변환 적용 (translate → rotate → scale 순)
// x, y = 앵커 캔버스 좌표 (왼쪽 위 원점, px)
export function applyTransform(ctx, worldTr) {
  ctx.translate(worldTr.x ?? 0, worldTr.y ?? 0);
  ctx.rotate((worldTr.rotation ?? 0) * Math.PI / 180);
  ctx.scale(worldTr.scale ?? 1, worldTr.scale ?? 1);
}

// 레이어 행렬: x, y = 캔버스 앵커 좌표 (왼쪽 위 원점)
export function layerMatrix(tr) {
  const rad = (tr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s   = tr.scale ?? 1;
  const tx  = tr.x ?? 0;
  const ty  = tr.y ?? 0;
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

// 부모→자식 변환 합성 (그룹 계층 구조용)
// x/y는 절대 캔버스 좌표. 부모 위치를 기준으로 상대 오프셋을 계산하고
// 부모 회전·축척을 적용한 뒤 부모 위치에 더한다.
export function composeTransforms(parent, child) {
  const rad = (parent.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s   = parent.scale  ?? 1;
  const rx  = (child.x  ?? 0) - (parent.x ?? 0);
  const ry  = (child.y  ?? 0) - (parent.y ?? 0);

  return {
    x:        (parent.x        ?? 0) + s * (rx * cos - ry * sin),
    y:        (parent.y        ?? 0) + s * (rx * sin + ry * cos),
    scale:    s * (child.scale    ?? 1),
    rotation: (parent.rotation ?? 0) + (child.rotation ?? 0),
    alpha:    (parent.alpha    ?? 1) * (child.alpha    ?? 1),
  };
}
