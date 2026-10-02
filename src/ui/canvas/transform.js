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
