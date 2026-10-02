import { getDocWorldTr, getLayerBounds } from './hit.js';
import { docToScreen, localToScreen } from './transform.js';

function _drawHandle(ctx, sx, sy, size = 6) {
  ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
}

// 선택 기즈모 + 그리드 + 스냅 가이드 그리기
// W, H는 CSS 픽셀 크기 (dpr 적용 전)
export function drawOverlay(ctx, doc, es, snapLines = [], W, H) {
  const { selection, f, zoom, panX, panY, grid } = es;
  const { width: docW, height: docH } = doc.meta;
  if (!W) W = ctx.canvas.width;
  if (!H) H = ctx.canvas.height;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 그리드
  if (grid) {
    const step = 50;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const { ox, oy } = _origin(zoom, panX, panY, W, H, docW, docH);

    const startCol = Math.floor(-ox / zoom / step) * step;
    const endCol   = Math.ceil((W - ox) / zoom / step) * step;
    for (let gx = startCol; gx <= endCol; gx += step) {
      const sx = gx * zoom + ox;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    const startRow = Math.floor(-oy / zoom / step) * step;
    const endRow   = Math.ceil((H - oy) / zoom / step) * step;
    for (let gy = startRow; gy <= endRow; gy += step) {
      const sy = gy * zoom + oy;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
    ctx.restore();
  }

  // 문서 경계선
  {
    const p1 = docToScreen(0, 0, zoom, panX, panY, W, H, docW, docH);
    const p2 = docToScreen(docW, docH, zoom, panX, panY, W, H, docW, docH);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    ctx.restore();
  }

  // 선택 기즈모
  if (selection.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#3a9dff';
    ctx.fillStyle = '#3a9dff';

    if (selection.length === 1) {
      // 단일 선택: 코너 핸들 + 회전 핸들
      const id = selection[0];
      const layer = doc.layers[id];
      if (layer) {
        const worldTr = getDocWorldTr(doc, id, f);
        const bounds  = getLayerBounds(layer);
        if (worldTr && bounds) {
          const { hw, hh } = bounds;
          const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
          const sp = corners.map(([lx, ly]) =>
            localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH));

          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sp[0].x, sp[0].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(sp[i].x, sp[i].y);
          ctx.closePath();
          ctx.stroke();

          // 코너 핸들 (흰색)
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#3a9dff';
          ctx.lineWidth = 1.5;
          for (const p of sp) {
            ctx.beginPath();
            ctx.rect(p.x - 4, p.y - 4, 8, 8);
            ctx.fill();
            ctx.stroke();
          }

          // 회전 핸들 (위쪽 중앙에서 20px 위)
          const rotHandle = localToScreen(0, -hh - 20, worldTr, zoom, panX, panY, W, H, docW, docH);
          const topMid    = localToScreen(0, -hh,      worldTr, zoom, panX, panY, W, H, docW, docH);
          ctx.strokeStyle = '#3a9dff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(topMid.x, topMid.y);
          ctx.lineTo(rotHandle.x, rotHandle.y);
          ctx.stroke();
          ctx.fillStyle = '#3a9dff';
          ctx.beginPath();
          ctx.arc(rotHandle.x, rotHandle.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // 다중 선택: 통합 AABB (축 정렬 경계 상자)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selection) {
        const layer = doc.layers[id];
        if (!layer) continue;
        const worldTr = getDocWorldTr(doc, id, f);
        const bounds  = getLayerBounds(layer);
        if (!worldTr || !bounds) continue;
        const { hw, hh } = bounds;
        for (const [lx, ly] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]) {
          const sp = localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH);
          if (sp.x < minX) minX = sp.x;
          if (sp.y < minY) minY = sp.y;
          if (sp.x > maxX) maxX = sp.x;
          if (sp.y > maxY) maxY = sp.y;
        }
      }
      if (minX < Infinity) {
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // 스냅 가이드
  if (snapLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#ff4488';
    ctx.lineWidth = 1;
    const { ox, oy } = _origin(zoom, panX, panY, W, H, docW, docH);
    for (const line of snapLines) {
      ctx.beginPath();
      if (line.axis === 'x') {
        const sx = line.docVal * zoom + ox;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
      } else {
        const sy = line.docVal * zoom + oy;
        ctx.moveTo(0, sy); ctx.lineTo(W, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function _origin(zoom, panX, panY, W, H, docW, docH) {
  return {
    ox: W / 2 - docW * zoom / 2 + panX,
    oy: H / 2 - docH * zoom / 2 + panY,
  };
}
