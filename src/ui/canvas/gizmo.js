import { getDocWorldTr, getLayerBounds, getParentWorldTr, localToWorldInParent } from './hit.js';
import { docToScreen, localToScreen } from './transform.js';
import { evalCamera } from '../../core/anim/evaluate.js';
import { evalProp } from '../../core/anim/prop.js';
import { isCurvedPath } from '../../core/anim/position.js';
import { effectCoordParams, coordToScreen } from './effect-coord.js';
import { maskPtToScreen } from './mask-space.js';

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
export function drawOverlay(ctx, doc, es, snapLines = [], W, H, assets = null) {
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

  // R23c 가이드(가운데 십자) — 화면 아래 줄 토글.
  if (es.guides) {
    const c = docToScreen(docW / 2, docH / 2, zoom, panX, panY, W, H, docW, docH);
    const a = docToScreen(0, 0, zoom, panX, panY, W, H, docW, docH);
    const b = docToScreen(docW, docH, zoom, panX, panY, W, H, docW, docH);
    ctx.save();
    ctx.strokeStyle = 'rgba(90,160,255,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(c.x, a.y); ctx.lineTo(c.x, b.y);
    ctx.moveTo(a.x, c.y); ctx.lineTo(b.x, c.y); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // R23c 안전 영역 — 컷인 템플릿 정보(doc.meta.safeArea)가 있으면 그걸, 없으면 가로·세로 각 90% 상자.
  if (es.safeArea) {
    const sa = doc.meta.safeArea;
    let x0, y0, x1, y1;
    if (sa && Number.isFinite(sa.x) && Number.isFinite(sa.w)) { x0 = sa.x; y0 = sa.y; x1 = sa.x + sa.w; y1 = sa.y + sa.h; }
    else { const mx = docW * 0.05, my = docH * 0.05; x0 = mx; y0 = my; x1 = docW - mx; y1 = docH - my; }
    const a = docToScreen(x0, y0, zoom, panX, panY, W, H, docW, docH);
    const b = docToScreen(x1, y1, zoom, panX, panY, W, H, docW, docH);
    ctx.save();
    ctx.strokeStyle = 'rgba(240,163,94,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]); ctx.restore();
  }

  // 카메라 영역(F2-6) — cameraActive 일 때 점선 사각형으로 카메라가 담는 범위 표시.
  if (es.cameraActive) {
    const cam = evalCamera(doc, f);
    const czoom = cam.zoom ?? 1;
    const cx = docW / 2, cy = docH / 2;
    // R8-1 새 의미: 화면 = z·p + T, T = c·(1−z) − z·(X,Y). 렌더(applyCamera)와 같은 식.
    const tx = cx * (1 - czoom) - czoom * (cam.x ?? 0);
    const ty = cy * (1 - czoom) - czoom * (cam.y ?? 0);
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

  // 모션 경로(F3-4, R18 곡선) — 단일 선택 + x/y 키가 있을 때. 보조 캔버스만(장면 재렌더 없음).
  if (selection.length === 1) {
    const layer = doc.layers[selection[0]];
    const keyFs = layer ? motionPathKeyFrames(layer) : [];
    if (layer && keyFs.length >= 2) {
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
      // 곡선이든 직선이든 경로 위 점은 getDocWorldTr(카메라·부모·곡선 모두 반영)로 구한다.
      const toScr = (ff) => { const w = getDocWorldTr(doc, layer.id, ff); return docToScreen(w.x, w.y, zoom, panX, panY, W, H, docW, docH); };
      const fc2 = doc.meta.frameCount ?? 1;
      const curved = isCurvedPath(layer.transform);
      // 경로 선 — 곡선이면 촘촘히 표본, 직선이면 프레임마다.
      ctx.save();
      ctx.strokeStyle = acc; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const STEPS = curved ? Math.max(fc2, keyFs.length * 24) : Math.max(1, fc2 - 1);
      const span = Math.max(1, (keyFs[keyFs.length - 1] - keyFs[0]));
      for (let sdx = 0; sdx <= STEPS; sdx++) {
        const ff = keyFs[0] + (sdx / STEPS) * span;
        const s = toScr(ff); sdx ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
      }
      ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      // R18 손잡이 — 편집 도구 + 곡선일 때. 각 x 키의 sp 를 화면으로.
      if (es.tool === 'edit' && curved) {
        const pwt = (ff) => getParentWorldTr(doc, layer.id, ff);
        const xk = layer.transform.x.keys, yk = layer.transform.y.keys;
        ctx.strokeStyle = acc; ctx.globalAlpha = 0.9; ctx.lineWidth = 1;
        for (let i = 0; i < xk.length; i++) {
          const sp = xk[i].sp; if (!sp) continue;
          const kx = xk[i].v, ky = yk[i].v;
          const parent = pwt(xk[i].f);
          const kw = localToWorldInParent(kx, ky, parent);
          const ks = docToScreen(kw.x, kw.y, zoom, panX, panY, W, H, docW, docH);
          for (const [hx, hy] of [[sp.ix ?? 0, sp.iy ?? 0], [sp.ox ?? 0, sp.oy ?? 0]]) {
            if (hx === 0 && hy === 0) continue;
            const hw = localToWorldInParent(kx + hx, ky + hy, parent);
            const hs = docToScreen(hw.x, hw.y, zoom, panX, panY, W, H, docW, docH);
            ctx.beginPath(); ctx.moveTo(ks.x, ks.y); ctx.lineTo(hs.x, hs.y); ctx.stroke();
            ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(hs.x, hs.y, 3.5, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }

      // 키프레임 점(빈 원)
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
      for (const kf of keyFs) { const s = toScr(kf); ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      // 현재 프레임 점(채운 원)
      const cur = toScr(f);
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // 이펙트 coord 점(R12-1) — 편집 도구에서 단일 이펙트 선택 시. 끌어서 위치를 정한다.
  if (es.tool === 'edit' && selection.length === 1) {
    const layer = doc.layers[selection[0]];
    if (layer && layer.type === 'effect') {
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
      for (const c of effectCoordParams(doc, layer.id)) {
        const s = coordToScreen(c.value, layer, doc, f, zoom, panX, panY, W, H);
        if (!s) continue;
        ctx.save();
        // 바깥 흰 테두리 + 안쪽 accent 점(어느 배경에서도 보이게)
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.stroke();
        // 이름 라벨(점 오른쪽 위)
        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        const tx = s.x + 8, ty = s.y - 6;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(c.label, tx, ty);
        ctx.fillStyle = '#ffffff'; ctx.fillText(c.label, tx, ty);
        ctx.restore();
      }
    }
  }

  // R21b 가리기 — 선택 레이어의 가리기 선·점·손잡이 + 그리는 중 미리보기(maskDraft).
  _drawMasks(ctx, doc, es, W, H, assets);

  // R23b: 끌어 놓기 대상 강조(왼쪽 패널에서 효과·에셋을 끌 때 그 레이어 테두리).
  if (es.dndHover && doc.layers[es.dndHover]) {
    const worldTr = getDocWorldTr(doc, es.dndHover, f);
    const bounds  = getLayerBounds(doc.layers[es.dndHover], assets);
    if (worldTr && bounds) {
      const { hw, hh, ox = 0, oy = 0 } = bounds;
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
      const cs = [[ox - hw, oy - hh], [ox + hw, oy - hh], [ox + hw, oy + hh], [ox - hw, oy + hh]]
        .map(([lx, ly]) => localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH));
      ctx.save();
      ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(cs[i].x, cs[i].y);
      ctx.closePath(); ctx.stroke(); ctx.restore();
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

          // 변 가운데 핸들 (한 방향만) — 작은 마름모로 코너와 구분
          for (const [ex, ey] of [[0, -hh], [hw, 0], [0, hh], [-hw, 0]]) {
            const p = localToScreen(ox + ex, oy + ey, worldTr, zoom, panX, panY, W, H, docW, docH);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x + 4, p.y);
            ctx.lineTo(p.x, p.y + 4); ctx.lineTo(p.x - 4, p.y);
            ctx.closePath(); ctx.fill(); ctx.stroke();
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

// R21b 가리기 선·점·손잡이. path 는 레이어 자체 좌표 → maskPtToScreen 으로 화면에 옮긴다(affine 이라 제어점도 선형 변환).
function _strokeMaskPath(ctx, path, layer, doc, f, view, assets, color, dashed) {
  const S = (x, y) => maskPtToScreen({ x, y }, layer, doc, f, view, assets);
  const pts = path.pts, n = pts.length;
  const s0 = S(pts[0].x, pts[0].y); if (!s0) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(s0.x, s0.y);
  const segs = path.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const c1 = S(a.x + (a.ox ?? 0), a.y + (a.oy ?? 0));
    const c2 = S(b.x + (b.ix ?? 0), b.y + (b.iy ?? 0));
    const e = S(b.x, b.y);
    if (c1 && c2 && e) ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y);
  }
  if (path.closed) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.restore();
}

function _drawMasks(ctx, doc, es, W, H, assets) {
  const { selection, f, zoom, panX, panY, tool, maskDraft } = es;
  const view = { zoom, panX, panY, W, H };
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';

  // 그리는 중 미리보기
  if (maskDraft?.path?.pts?.length) {
    const dl = doc.layers[maskDraft.layerId];
    if (dl) {
      _strokeMaskPath(ctx, maskDraft.path, dl, doc, f, view, assets, acc, true);
      if (maskDraft.cursor && maskDraft.path.pts.length) {
        const last = maskDraft.path.pts[maskDraft.path.pts.length - 1];
        const s = maskPtToScreen(last, dl, doc, f, view, assets);
        if (s) { ctx.save(); ctx.strokeStyle = acc; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(maskDraft.cursor.cx, maskDraft.cursor.cy); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
      }
    }
  }

  if (selection.length !== 1) return;
  const layer = doc.layers[selection[0]];
  if (!layer?.masks?.order?.length) return;
  const showPts = tool === 'edit' || tool === 'pen' || tool === 'maskRect' || tool === 'maskEllipse';

  for (const mid of layer.masks.order) {
    const item = layer.masks.items[mid]; if (!item) continue;
    const path = evalProp(item.path, f);
    if (!path?.pts?.length) continue;
    _strokeMaskPath(ctx, path, layer, doc, f, view, assets, acc, false);
    if (!showPts) continue;
    ctx.save();
    for (const p of path.pts) {
      // 손잡이(편집 도구)
      if (tool === 'edit') {
        for (const [hx, hy] of [[p.ox ?? 0, p.oy ?? 0], [p.ix ?? 0, p.iy ?? 0]]) {
          if (hx === 0 && hy === 0) continue;
          const ps = maskPtToScreen(p, layer, doc, f, view, assets);
          const hs = maskPtToScreen({ x: p.x + hx, y: p.y + hy }, layer, doc, f, view, assets);
          if (!ps || !hs) continue;
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(hs.x, hs.y); ctx.stroke();
          ctx.fillStyle = acc; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(hs.x, hs.y, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      const s = maskPtToScreen(p, layer, doc, f, view, assets);
      if (!s) continue;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}
