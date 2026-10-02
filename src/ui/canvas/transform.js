// 문서 좌표 ↔ 스테이지 화면 좌표 변환 헬퍼

export function docOrigin(zoom, panX, panY, stageW, stageH, docW, docH) {
  return {
    ox: stageW / 2 - docW * zoom / 2 + panX,
    oy: stageH / 2 - docH * zoom / 2 + panY,
  };
}

export function docToScreen(docX, docY, zoom, panX, panY, stageW, stageH, docW, docH) {
  const { ox, oy } = docOrigin(zoom, panX, panY, stageW, stageH, docW, docH);
  return { x: docX * zoom + ox, y: docY * zoom + oy };
}

export function screenToDoc(screenX, screenY, zoom, panX, panY, stageW, stageH, docW, docH) {
  const { ox, oy } = docOrigin(zoom, panX, panY, stageW, stageH, docW, docH);
  return { x: (screenX - ox) / zoom, y: (screenY - oy) / zoom };
}

// worldTr의 로컬 좌표 (lx, ly) → 화면 좌표 (CSS 픽셀)
export function localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH) {
  const rad = (worldTr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = worldTr.scale ?? 1;
  const dx = s * (lx * cos - ly * sin);
  const dy = s * (lx * sin + ly * cos);
  return docToScreen(
    (worldTr.x ?? 0) + dx,
    (worldTr.y ?? 0) + dy,
    zoom, panX, panY, W, H, docW, docH,
  );
}
