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

// ctx에 worldTr 변환 적용 (translate → rotate → scale(전체) → scaleX/scaleY(가로·세로 보정) 순)
// x, y = 앵커 캔버스 좌표 (왼쪽 위 원점, px)
// scaleX/scaleY 는 레이어 로컬 공간의 비균등 스트레치(회전 뒤 적용). 기본 1.
// box(선택) = { top, bottom } 콘텐츠의 위·아래 끝 로컬 y. 기울기(skewX, R27 모션 채널)의 고정점 계산용.
export function applyTransform(ctx, worldTr, box) {
  const s = worldTr.scale ?? 1;
  ctx.translate(worldTr.x ?? 0, worldTr.y ?? 0);
  ctx.rotate((worldTr.rotation ?? 0) * Math.PI / 180);
  ctx.scale(s * (worldTr.scaleX ?? 1), s * (worldTr.scaleY ?? 1));
  if (worldTr.skewX) {
    const k = skewK(worldTr);
    const oy = skewOriginY(worldTr, box);
    ctx.transform(1, 0, -k, 1, k * oy, 0); // x' = x + k·(oy − y): 고정점 줄은 그대로, 멀수록 옆으로
  }
}

// 기울기(R27): skewX 도(+면 고정점 반대쪽 끝이 오른쪽으로). skewPivot = 고정점 세로 비율(0 위 ~ 1 아래, 기본 1).
export function skewK(worldTr) { return Math.tan((worldTr.skewX ?? 0) * Math.PI / 180); }
export function skewOriginY(worldTr, box) {
  if (!box) return 0;
  const p = worldTr.skewPivot ?? 1;
  return box.top + (box.bottom - box.top) * p;
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

// 카메라(R8-1): 화면 가운데 c=(W/2,H/2) 기준 줌 + 이동.
//   화면 = c + z·(p − c − (X,Y)) = z·p + T,  T = c·(1−z) − z·(X,Y)
//   카메라가 오른쪽(X+)으로 가면 그림은 왼쪽으로. 기본값(X0,Y0,z1)이면 항등.
export function cameraScreenTr(cam, width, height) {
  const z  = cam?.zoom ?? 1;
  const cx = width / 2, cy = height / 2;
  return { z, tx: cx * (1 - z) - z * (cam?.x ?? 0), ty: cy * (1 - z) - z * (cam?.y ?? 0) };
}

// worldTr(문서 단위)에 카메라를 얹어 화면 단위 worldTr 로. 회전 0·균등 줌이라 위치·전체 scale 만 바뀐다.
export function applyCamera(worldTr, camScr) {
  if (!camScr) return worldTr;
  const { z, tx, ty } = camScr;
  return {
    ...worldTr,
    x:     z * (worldTr.x ?? 0) + tx,
    y:     z * (worldTr.y ?? 0) + ty,
    scale: z * (worldTr.scale ?? 1),
  };
}

// 카메라 행렬(새 의미): 화면 = z·p + T. (표시용 보조 — 렌더는 applyCamera 사용)
export function cameraMatrix(cam, width, height) {
  const { z, tx, ty } = cameraScreenTr(cam, width, height);
  return [z, 0, 0, z, tx, ty];
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
    // 가로·세로 보정은 곱으로 전파(축 정렬 기준 정확, 회전된 비균등 부모에선 근사).
    scaleX:   (parent.scaleX   ?? 1) * (child.scaleX   ?? 1),
    scaleY:   (parent.scaleY   ?? 1) * (child.scaleY   ?? 1),
    rotation: (parent.rotation ?? 0) + (child.rotation ?? 0),
    alpha:    (parent.alpha    ?? 1) * (child.alpha    ?? 1),
    // 렌더 전용 채널은 레이어 로컬 — 자식 값을 그대로 전달.
    brightness: child.brightness,
    skewX:      child.skewX,
    skewPivot:  child.skewPivot,
    slices:     child.slices,
    wrapX:      child.wrapX,
    wrapY:      child.wrapY,
  };
}
