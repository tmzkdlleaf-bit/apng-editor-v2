import { getDocWorldTr, getLayerBounds } from './hit.js';

const THRESHOLD_PX = 6; // 화면 픽셀 기준 스냅 임계값

// 스냅 후보 목록 반환 (doc 좌표)
function _candidates(doc, es, excludeIds) {
  const { width: docW, height: docH } = doc.meta;
  const pts = [];

  // 캔버스 경계·중심·3등분
  pts.push({ x: 0, y: null }, { x: docW, y: null }, { x: docW / 2, y: null });
  pts.push({ x: null, y: 0 }, { x: null, y: docH }, { x: null, y: docH / 2 });
  pts.push({ x: docW / 3, y: null }, { x: docW * 2 / 3, y: null });
  pts.push({ x: null, y: docH / 3 }, { x: null, y: docH * 2 / 3 });

  // 그리드
  if (es.grid) {
    const step = 50;
    for (let gx = 0; gx <= docW; gx += step) pts.push({ x: gx, y: null });
    for (let gy = 0; gy <= docH; gy += step) pts.push({ x: null, y: gy });
  }

  // 다른 레이어 경계·중심
  const { f } = es;
  for (const id of doc.order) {
    if (excludeIds.includes(id)) continue;
    const layer = doc.layers[id];
    if (!layer || layer.visible === false) continue;
    const worldTr = getDocWorldTr(doc, id, f);
    if (!worldTr) continue;
    const bounds = getLayerBounds(layer);
    if (!bounds) continue;
    const { x, y } = worldTr;
    const { hw, hh } = bounds;
    pts.push({ x, y: null });
    pts.push({ x: null, y });
    pts.push({ x: x - hw, y: null }, { x: x + hw, y: null });
    pts.push({ x: null, y: y - hh }, { x: null, y: y + hh });
  }

  return pts;
}

// nearX/nearY: doc 좌표에서 스냅 적용
// 반환: { x, y, lines }
// Alt 키가 눌려 있으면 스냅 비활성화
export function computeSnap(docX, docY, doc, es, excludeIds, altKey = false) {
  if (!es.snap || altKey) return { x: docX, y: docY, lines: [] };

  const thresh = THRESHOLD_PX / es.zoom;
  const candidates = _candidates(doc, es, excludeIds);
  const lines = [];
  let snappedX = docX;
  let snappedY = docY;

  let bestDX = thresh, bestDY = thresh;

  for (const c of candidates) {
    if (c.x !== null) {
      const d = Math.abs(docX - c.x);
      if (d < bestDX) { bestDX = d; snappedX = c.x; lines.push({ axis: 'x', docVal: c.x }); }
    }
    if (c.y !== null) {
      const d = Math.abs(docY - c.y);
      if (d < bestDY) { bestDY = d; snappedY = c.y; lines.push({ axis: 'y', docVal: c.y }); }
    }
  }

  // 적용된 스냅 선만 유지
  const filteredLines = [];
  if (snappedX !== docX) filteredLines.push(...lines.filter(l => l.axis === 'x' && l.docVal === snappedX));
  if (snappedY !== docY) filteredLines.push(...lines.filter(l => l.axis === 'y' && l.docVal === snappedY));

  return { x: snappedX, y: snappedY, lines: filteredLines };
}
