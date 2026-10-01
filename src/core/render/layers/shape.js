// 도형 레이어 렌더러 — rect / ellipse / polygon / line
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

// layer.shape: { kind, w, h, radius, sides, fill(색 문자열), stroke({color,width}|null) }
function _drawShape(ctx, shape) {
  const kind   = shape.kind ?? 'rect';
  const fill   = shape.fill;   // 색 문자열 '#rrggbb' 또는 null
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
      ctx.arcTo(-w / 2,  h / 2, -w / 2,  h / 2 - ry, rx);
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
  } else if (kind === 'line') {
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo( w / 2, 0);
  }

  if (fill && kind !== 'line') {
    ctx.fillStyle = fill; // fill은 색 문자열
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
  const { pool, width, height, f } = rctx;

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  applyTransform(tmpC, worldTr);
  _drawShape(tmpC, layer.shape ?? {});
  tmpC.restore();

  if (layer.mask && rctx.renderMask) {
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
  }

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
