import { getDocWorldTr, getLayerBounds } from './hit.js';
import { docToScreen, localToScreen } from './transform.js';
import { evalCamera } from '../../core/anim/evaluate.js';
import { evalProp } from '../../core/anim/prop.js';

// 선택 레이어의 위치 경로 점(키 있는 x 또는 y) — 보조 캔버스에 그린다. 장면 재렌더와 무관.
export function motionPathKeyFrames(layer) {
  const set = new Set();
  for (const k of (layer?.transform?.x?.keys ?? [])) set.add(k.f);
  for (const k of (layer?.transform?.y?.keys ?? [])) set.add(k.f);
  return [...set].sort((a, b) => a - b);
}

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
    const step = es.gridStep ?? 50;
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

  // 카메라 영역(F2-6) — cameraActive 일 때 점선 사각형으로 카메라가 담는 범위 표시.
  if (es.cameraActive) {
    const cam = evalCamera(doc, f);
    const czoom = cam.zoom ?? 1;
    const cx = docW / 2, cy = docH / 2;
    const tx = cx * (1 - czoom) + czoom * (cam.x ?? 0);
    const ty = cy * (1 - czoom) + czoom * (cam.y ?? 0);
    // 카메라가 담는 doc 영역: screen=zoom*p+t ∈ [0,doc] → p ∈ [-t/zoom, (doc-t)/zoom]
    const rx0 = -tx / czoom, ry0 = -ty / czoom;
    const rx1 = (docW - tx) / czoom, ry1 = (docH - ty) / czoom;
    const a = docToScreen(rx0, ry0, zoom, panX, panY, W, H, docW, docH);
    const b = docToScreen(rx1, ry1, zoom, panX, panY, W, H, docW, docH);
    ctx.save();
    ctx.strokeStyle = 'var(--acc)';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 모션 경로(F3-4) — 단일 선택 + x/y 키가 있을 때. 보조 캔버스만(장면 재렌더 없음).
  if (selection.length === 1) {
    const layer = doc.layers[selection[0]];
    const keyFs = layer ? motionPathKeyFrames(layer) : [];
    if (layer && keyFs.length >= 2) {
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
      const px = layer.transform.x, py = layer.transform.y;
      const toScr = (ff) => docToScreen(evalProp(px, ff), evalProp(py, ff), zoom, panX, panY, W, H, docW, docH);
      // 점선 경로
      ctx.save();
      ctx.strokeStyle = acc; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const fc2 = doc.meta.frameCount ?? 1;
      for (let ff = 0; ff < fc2; ff++) { const s = toScr(ff); ff ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
      ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // 키프레임 점(빈 원)
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
      for (const kf of keyFs) { const s = toScr(kf); ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      // 현재 프레임 점(채운 원)
      const cur = toScr(f);
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
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
          const { hw, hh, ox = 0, oy = 0 } = bounds;
          const corners = [
            [ox - hw, oy - hh], [ox + hw, oy - hh],
            [ox + hw, oy + hh], [ox - hw, oy + hh],
          ];
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
          const rotHandle = localToScreen(ox, oy - hh - 20, worldTr, zoom, panX, panY, W, H, docW, docH);
          const topMid    = localToScreen(ox, oy - hh,      worldTr, zoom, panX, panY, W, H, docW, docH);
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
      // 다중 선택: 통합 AABB + 코너 핸들
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selection) {
        const layer = doc.layers[id];
        if (!layer) continue;
        const worldTr = getDocWorldTr(doc, id, f);
        const bounds  = getLayerBounds(layer);
        if (!worldTr || !bounds) continue;
        const { hw, hh, ox = 0, oy = 0 } = bounds;
        for (const [lx, ly] of [[ox-hw,oy-hh],[ox+hw,oy-hh],[ox+hw,oy+hh],[ox-hw,oy+hh]]) {
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

        // 코너 핸들 (흰색)
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3a9dff';
        ctx.lineWidth = 1.5;
        for (const [cx, cy] of [[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]]) {
          ctx.beginPath();
          ctx.rect(cx - 4, cy - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
        }
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
