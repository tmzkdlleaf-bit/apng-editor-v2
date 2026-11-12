// 도형 레이어 렌더러 — rect / ellipse / polygon / line
import { hasChannels, drawWithChannels } from '../channels.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';
import { hasActiveFx, drawLeafWithFx } from '../fx-stack.js';
import { hasActiveMasks } from '../shape-mask.js';

// fill 을 canvas fillStyle 로 해석. 문자열이면 단색, 객체면 그라디언트.
//   fill = '#rrggbb'  또는  { type:'linear'|'radial', angle, stops:[{offset,color}, ...] }
// 경로는 도형 중심(0,0) 기준 로컬 좌표(-w/2..w/2)에 그려지므로 그라디언트도 그 좌표계로.
function _resolveFill(ctx, fill, w, h) {
  if (!fill) return null;
  if (typeof fill === 'string') return fill;
  const stops = (Array.isArray(fill.stops) && fill.stops.length >= 2)
    ? fill.stops
    : [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }];
  let grad;
  if (fill.type === 'radial') {
    grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
  } else {
    const ang = (fill.angle ?? 0) * Math.PI / 180;
    const dx = Math.cos(ang) * w / 2, dy = Math.sin(ang) * h / 2;
    grad = ctx.createLinearGradient(-dx, -dy, dx, dy);
  }
  for (const s of stops) {
    const off = Math.max(0, Math.min(1, s.offset ?? 0));
    grad.addColorStop(off, s.color ?? '#000000');
  }
  return grad;
}

// layer.shape: { kind, w, h, radius, sides, innerRatio, fill(문자열|그라디언트), stroke({color,width}|null) }
function _drawShape(ctx, shape) {
  const kind   = shape.kind ?? 'rect';
  const fill   = shape.fill;
  const stroke = shape.stroke; // { color, width } 또는 null
  const w      = shape.w ?? 100;
  const h      = shape.h ?? 100;

  ctx.beginPath();

  if (kind === 'rect') {
    const r = shape.radius ?? 0;
    if (r > 0) {
      const rx = Math.min(r, w / 2), ry = Math.min(r, h / 2);
      ctx.moveTo(-w / 2 + rx, -h / 2);
      ctx.lineTo( w / 2 - rx, -h / 2);
      ctx.arcTo(  w / 2, -h / 2,  w / 2, -h / 2 + ry, rx);
      ctx.lineTo( w / 2,  h / 2 - ry);
      ctx.arcTo(  w / 2,  h / 2,  w / 2 - rx,  h / 2, ry);
      ctx.lineTo(-w / 2 + rx,  h / 2);
      ctx.arcTo(-w / 2,  h / 2, -w / 2,  h / 2 - ry, ry);
      ctx.lineTo(-w / 2, -h / 2 + ry);
      ctx.arcTo(-w / 2, -h / 2, -w / 2 + rx, -h / 2, rx);
      ctx.closePath();
    } else {
      ctx.rect(-w / 2, -h / 2, w, h);
    }
  } else if (kind === 'ellipse') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (kind === 'polygon') {
    const sides = Math.max(3, shape.sides ?? 6);
    const outer = Math.min(w, h) / 2;
    const startA = -Math.PI / 2;
    for (let i = 0; i < sides; i++) {
      const angle = startA + (i / sides) * Math.PI * 2;
      const px = Math.cos(angle) * outer;
      const py = Math.sin(angle) * outer;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === 'star') {
    const points = Math.max(3, shape.sides ?? 5);
    const outer  = Math.min(w, h) / 2;
    const inner  = outer * Math.max(0.1, Math.min(0.9, shape.innerRatio ?? 0.5));
    const startA = -Math.PI / 2;
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? outer : inner;
      const angle = startA + (i / (points * 2)) * Math.PI * 2;
      const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === 'path') {
    // shape.points: [{x,y}] (0..1 정규화) → 도형 중심 기준 로컬 좌표로.
    const pts = Array.isArray(shape.points) ? shape.points : [];
    for (let i = 0; i < pts.length; i++) {
      const px = (pts[i].x - 0.5) * w, py = (pts[i].y - 0.5) * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    if (shape.closed !== false) ctx.closePath();
  } else if (kind === 'line') {
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo( w / 2, 0);
  }

  if (fill && kind !== 'line') {
    ctx.fillStyle = _resolveFill(ctx, fill, w, h);
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke.color ?? '#000000';
    ctx.lineWidth   = stroke.width ?? 1;
    ctx.lineCap     = stroke.cap   ?? 'butt';
    ctx.lineJoin    = stroke.join  ?? 'miter';
    ctx.stroke();
  }
}

export function renderShapeLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { pool, cache, width, height, viewOffsetX = 0, viewOffsetY = 0, f } = rctx;
  const shape = layer.shape ?? {};

  // 콘텐츠 캐시 키 (프레임 무관 — 도형 속성만)
  const cacheKey = `${layer.id}:shape:${shape.kind}:${shape.w}:${shape.h}:${JSON.stringify(shape.fill)}` +
    `:${JSON.stringify(shape.stroke)}:${shape.radius ?? 0}:${shape.sides ?? 6}:${shape.innerRatio ?? 0.5}` +
    (shape.kind === 'path' ? `:${JSON.stringify(shape.points)}` : '');

  let contentCanvas = cache?.get(cacheKey);
  if (!contentCanvas) {
    // 획 두께의 절반만큼 여백 추가 (획이 경계 밖으로 나오지 않도록)
    const strokePad = shape.stroke?.width ? Math.ceil(shape.stroke.width / 2) + 2 : 1;
    const cw = Math.max(1, Math.ceil((shape.w ?? 100) + strokePad * 2));
    const ch = Math.max(1, Math.ceil((shape.h ?? 100) + strokePad * 2));

    const cc  = pool.borrow(cw, ch);
    const ccx = cc.getContext('2d');
    ccx.save();
    ccx.translate(cw / 2, ch / 2);
    _drawShape(ccx, shape);
    ccx.restore();

    contentCanvas = cc;
    cache?.set(cacheKey, contentCanvas); // 풀에 반환하지 않음 — 캐시가 소유
  }

  const cw = contentCanvas.width;
  const ch = contentCanvas.height;

  // R17: 쌓은 효과 — 도형 중심(cw/2,ch/2)이 앵커. 벡터 도형을 해상도 k 로 구워 확대해도 선명. R21: 가리기도 같은 경로.
  if (hasActiveFx(layer, rctx.effects) || hasActiveMasks(layer)) {
    drawLeafWithFx(outputCtx, (k) => {
      const bw = Math.max(1, Math.round(cw * k)), bh = Math.max(1, Math.round(ch * k));
      const c = pool.borrow(bw, bh); const cx = c.getContext('2d');
      cx.save(); cx.scale(k, k); cx.translate(cw / 2, ch / 2); _drawShape(cx, shape); cx.restore();
      return { canvas: c, srcCw: bw, srcCh: bh, release: () => pool.release(c) };
    }, { dW: cw, dH: ch, ox: cw / 2, oy: ch / 2 }, layer, worldTr, totalAlpha, rctx);
    return;
  }

  const hasMask = !!(layer.mask && rctx.renderMask);

  if (!hasMask) {
    // 마스크 없음: 직접 출력 (작업 캔버스 불필요)
    outputCtx.save();
    applyTransform(outputCtx, worldTr, { top: -ch / 2, bottom: ch / 2 });
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    // R27: 띠 밀기·이어 그리기 채널(바람 흔들림 등)을 도형에도.
    if (hasChannels(worldTr)) drawWithChannels(outputCtx, contentCanvas, cw, ch, 0.5, 0.5, worldTr);
    else outputCtx.drawImage(contentCanvas, -cw / 2, -ch / 2);
    outputCtx.restore();
    return;
  }

  // 마스크 있음: 작업 캔버스에 그린 뒤 합성
  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  tmpC.translate(-viewOffsetX, -viewOffsetY);  // view 일부만 그릴 때 마스크 캔버스와 좌표 일치
  applyTransform(tmpC, worldTr, { top: -ch / 2, bottom: ch / 2 });
  tmpC.drawImage(contentCanvas, -cw / 2, -ch / 2);
  tmpC.restore();

  const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
  const sourceLayer = rctx.doc.layers[sourceId];
  if (sourceLayer) {
    const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
    if (maskCanvas) {
      tmpC.setTransform(1, 0, 0, 1, 0, 0);
      tmpC.globalAlpha = 1;
      tmpC.globalCompositeOperation = 'destination-in';
      tmpC.drawImage(maskCanvas, 0, 0);
      tmpC.globalCompositeOperation = 'source-over';
      pool.release(maskCanvas);
    }
  }

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
