import { getDocWorldTr, getLayerBounds } from './hit.js';
import { docToScreen } from './transform.js';

// worldTr + 로컬 점 → 화면 좌표
function _localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH) {
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

function _drawHandle(ctx, sx, sy, size = 6) {
  ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
}

// 선택 기즈모 + 그리드 + 스냅 가이드 그리기
export function drawOverlay(ctx, doc, es, snapLines = []) {
  const { selection, f, zoom, panX, panY, grid } = es;
  const { width: docW, height: docH } = doc.meta;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  ctx.clearRect(0, 0, W, H);

  // 그리드
  if (grid) {
    const step = 50; // 50px doc 단위
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
    ctx.lineWidth = 1.5 / zoom;

    for (const id of selection) {
      const layer = doc.layers[id];
      if (!layer) continue;
      const worldTr = getDocWorldTr(doc, id, f);
      if (!worldTr) continue;
      const bounds = getLayerBounds(layer);
      if (!bounds) continue;

      const { hw, hh } = bounds;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      const sp = corners.map(([lx, ly]) =>
        _localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH));

      ctx.beginPath();
      ctx.moveTo(sp[0].x, sp[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(sp[i].x, sp[i].y);
      ctx.closePath();
      ctx.stroke();

      // 코너 핸들
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3a9dff';
      ctx.lineWidth = 1.5;
      for (const p of sp) _drawHandle(ctx, p.x, p.y, 8);

      // 회전 핸들 (위쪽 중앙에서 20px 위)
      const rotHandle = _localToScreen(0, -hh - 20, worldTr, zoom, panX, panY, W, H, docW, docH);
      const topMid    = _localToScreen(0, -hh, worldTr, zoom, panX, panY, W, H, docW, docH);
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
    ctx.restore();
  }

  // 스냅 가이드
  if (snapLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#ff4488';
    ctx.lineWidth = 1;
    for (const line of snapLines) {
      ctx.beginPath();
      if (line.axis === 'x') {
        const sx = line.docVal * zoom + _origin(zoom, panX, panY, W, H, docW, docH).ox;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
      } else {
        const sy = line.docVal * zoom + _origin(zoom, panX, panY, W, H, docW, docH).oy;
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
