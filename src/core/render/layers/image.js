import { applyAdjust, hasAdjust, applyBlur } from '../adjust.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';
import { renderExit } from '../exit.js';

function _drawOutline(ctx, sil, steps, ow) {
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(angle) * ow, Math.sin(angle) * ow);
  }
}

function _applyTint(ctx, w, h, tint) {
  const { color, strength = 1 } = tint;
  const amt = Math.max(0, Math.min(1, strength));
  if (!color || amt <= 0) return;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = amt;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function _applyMask(tmpC, maskOpts, rctx, f, w, h) {
  const { sourceId, mode = 'alpha', invert = false, feather = 0 } = maskOpts;
  const sourceLayer = rctx.doc.layers[sourceId];
  if (!sourceLayer || !rctx.renderMask) return;

  const maskCanvas = rctx.renderMask(sourceLayer, f, w, h, { mode, invert, feather });
  if (!maskCanvas) return;

  tmpC.setTransform(1, 0, 0, 1, 0, 0);
  tmpC.globalAlpha = 1;
  tmpC.globalCompositeOperation = 'destination-in';
  tmpC.drawImage(maskCanvas, 0, 0);
  tmpC.globalCompositeOperation = 'source-over';
  rctx.pool.release(maskCanvas);
}

export function renderImageLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { assets, pool, cache, docWidth, docHeight, width, height, f } = rctx;
  const bitmap = assets.getBitmap?.(layer.assetId);
  if (!bitmap) return;

  const bW = bitmap.width   ?? bitmap.naturalWidth  ?? 0;
  const bH = bitmap.height  ?? bitmap.naturalHeight ?? 0;
  if (!bW || !bH) return;

  // exit 처리
  if (layer.exit?.startF !== undefined && f >= layer.exit.startF) {
    if (renderExit(outputCtx, bitmap, worldTr, layer, f, width, height, pool)) return;
  }

  const ax = layer.anchor?.x ?? 0.5;
  const ay = layer.anchor?.y ?? 0.5;
  const blur = layer.adjust?.blur ?? 0;

  const cacheKey = `${layer.id}:img:${layer.assetId}:${JSON.stringify([layer.adjust, layer.tint, layer.outline, blur])}`;
  let contentCanvas = cache.get(cacheKey);

  if (!contentCanvas) {
    const cc  = pool.borrow(bW, bH);
    const ccx = cc.getContext('2d');

    ccx.drawImage(bitmap, 0, 0, bW, bH);

    if (hasAdjust(layer.adjust)) {
      const id = ccx.getImageData(0, 0, bW, bH);
      applyAdjust(id, layer.adjust);
      ccx.putImageData(id, 0, 0);
      cache.incAdjustCount();
    }

    if (layer.tint) _applyTint(ccx, bW, bH, layer.tint);

    contentCanvas = cc;
    cache.set(cacheKey, contentCanvas);
  }

  const hasOutline = (layer.outline?.width ?? 0) > 0;
  const hasBlur    = blur > 0;

  if (!hasOutline && !hasBlur && !layer.mask) {
    outputCtx.save();
    applyTransform(outputCtx, worldTr);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(contentCanvas, -bW * ax, -bH * ay);
    outputCtx.restore();
    return;
  }

  // 복잡한 경로: 전체 문서 크기 작업 캔버스 — view 오프셋과 독립적으로 위치 계산
  const tmpW = docWidth  ?? width;
  const tmpH = docHeight ?? height;
  const tmp  = pool.borrow(tmpW, tmpH);
  const tmpC = tmp.getContext('2d');

  if (hasOutline) {
    const steps = Math.max(4, Math.round((layer.outline.quality ?? 2)) * 8);
    const ow    = layer.outline.width ?? 2;
    const color = layer.outline.color ?? '#ffffff';
    const sil   = pool.borrow(tmpW, tmpH);
    const silC  = sil.getContext('2d');
    silC.save();
    applyTransform(silC, worldTr);
    silC.drawImage(contentCanvas, -bW * ax, -bH * ay);
    silC.restore();
    silC.globalCompositeOperation = 'source-in';
    silC.fillStyle = color;
    silC.fillRect(0, 0, tmpW, tmpH);
    silC.globalCompositeOperation = 'source-over';
    _drawOutline(tmpC, sil, steps, ow);
    pool.release(sil);
  }

  tmpC.save();
  applyTransform(tmpC, worldTr);
  tmpC.drawImage(contentCanvas, -bW * ax, -bH * ay);
  tmpC.restore();

  if (hasBlur) {
    const id = tmpC.getImageData(0, 0, tmpW, tmpH);
    applyBlur(id, blur * (worldTr.scale ?? 1));
    tmpC.putImageData(id, 0, 0);
  }

  if (layer.mask) _applyMask(tmpC, layer.mask, rctx, f, tmpW, tmpH);

  // setTransform 리셋 없음 — outputCtx의 view 오프셋 translate 유지
  outputCtx.save();
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
