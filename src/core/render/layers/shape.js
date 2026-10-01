// 도형 레이어 렌더러 — rect / ellipse / polygon / line

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

function _applyTransform(ctx, worldTr, w, h) {
  ctx.translate(w / 2 + (worldTr.x ?? 0), h / 2 + (worldTr.y ?? 0));
  ctx.rotate((worldTr.rotation ?? 0) * Math.PI / 180);
  ctx.scale(worldTr.scale ?? 1, worldTr.scale ?? 1);
}

function _drawShape(ctx, shape) {
  const type   = shape.type   ?? 'rect';
  const fill   = shape.fill;
  const stroke = shape.stroke;
  const w      = shape.width  ?? 100;
  const h      = shape.height ?? 100;

  ctx.beginPath();

  if (type === 'rect') {
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
  } else if (type === 'ellipse') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (type === 'polygon') {
    const sides  = Math.max(3, shape.sides ?? 5);
    const outer  = Math.min(w, h) / 2;
    const inner  = shape.innerRadius ?? null;
    const startA = -Math.PI / 2;
    for (let i = 0; i < sides; i++) {
      const angle = startA + (i / sides) * Math.PI * 2;
      const px = Math.cos(angle) * outer;
      const py = Math.sin(angle) * outer;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      if (inner !== null) {
        const ia = angle + Math.PI / sides;
        ctx.lineTo(Math.cos(ia) * inner, Math.sin(ia) * inner);
      }
    }
    ctx.closePath();
  } else if (type === 'line') {
    const x1 = shape.x1 ?? -w / 2, y1 = shape.y1 ?? 0;
    const x2 = shape.x2 ??  w / 2, y2 = shape.y2 ?? 0;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  if (fill && type !== 'line') {
    ctx.fillStyle = fill.color ?? '#ffffff';
    ctx.globalAlpha = fill.opacity ?? 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (stroke) {
    ctx.strokeStyle  = stroke.color ?? '#000000';
    ctx.lineWidth    = stroke.width ?? 1;
    ctx.lineCap      = stroke.cap   ?? 'butt';
    ctx.lineJoin     = stroke.join  ?? 'miter';
    ctx.globalAlpha  = stroke.opacity ?? 1;
    ctx.stroke();
    ctx.globalAlpha  = 1;
  }
}

export function renderShapeLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { pool, width, height, f } = rctx;

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  _applyTransform(tmpC, worldTr, width, height);
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
  outputCtx.globalCompositeOperation = _blendOp(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
