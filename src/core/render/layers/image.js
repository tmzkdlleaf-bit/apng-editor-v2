import { applyAdjust, hasAdjust, applyBlur } from '../adjust.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';
import { renderExit } from '../exit.js';

// 외곽선: 실루엣을 여러 각도로 그려 외곽선 효과 (ctx.filter 미사용)
function _drawOutline(ctx, sil, steps, ow) {
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(angle) * ow, Math.sin(angle) * ow);
  }
}

// 색 덮기: source-atop으로 color를 strength만큼 합성
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
  const { assets, pool, cache, width, height, f } = rctx;
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

  // 캐시 키: assetId + adjust + tint + outline + blur
  const cacheKey = `${layer.id}:img:${layer.assetId}:${JSON.stringify([layer.adjust, layer.tint, layer.outline, blur])}`;
  let contentCanvas = cache.get(cacheKey);

  if (!contentCanvas) {
    const cc  = pool.borrow(bW, bH);
    const ccx = cc.getContext('2d');

    ccx.drawImage(bitmap, 0, 0, bW, bH);

    if (hasAdjust(layer.adjust)) {
      const id = ccx.getImageData(0, 0, bW, bH);
      applyAdjust(id, layer.adjust);
      // blur는 출력 좌표계 기준이어야 하므로 캐시 후 별도 처리
      ccx.putImageData(id, 0, 0);
      cache.incAdjustCount();
    }

    if (layer.tint) _applyTint(ccx, bW, bH, layer.tint);

    contentCanvas = cc;
    cache.set(cacheKey, contentCanvas);
  }

  const hasOutline = (layer.outline?.width ?? 0) > 0;
  const hasBlur    = blur > 0;

  // 단순 경로: 마스크·외곽선·블러 없음 → 직접 출력 캔버스에 그리기
  if (!hasOutline && !hasBlur && !layer.mask) {
    outputCtx.save();
    applyTransform(outputCtx, worldTr);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(contentCanvas, -bW * ax, -bH * ay);
    outputCtx.restore();
    return;
  }

  // 복잡한 경로: 작업 캔버스에 그린 뒤 합성
  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  if (hasOutline) {
    const steps = Math.max(4, Math.round((layer.outline.quality ?? 2)) * 8);
    const ow    = layer.outline.width ?? 2;
    const color = layer.outline.color ?? '#ffffff';
    const sil   = pool.borrow(width, height);
    const silC  = sil.getContext('2d');
    silC.save();
    applyTransform(silC, worldTr);
    silC.drawImage(contentCanvas, -bW * ax, -bH * ay);
    silC.restore();
    silC.globalCompositeOperation = 'source-in';
    silC.fillStyle = color;
    silC.fillRect(0, 0, width, height);
    silC.globalCompositeOperation = 'source-over';
    _drawOutline(tmpC, sil, steps, ow);
    pool.release(sil);
  }

  tmpC.save();
  applyTransform(tmpC, worldTr);
  tmpC.drawImage(contentCanvas, -bW * ax, -bH * ay);
  tmpC.restore();

  if (hasBlur) {
    const id = tmpC.getImageData(0, 0, width, height);
    applyBlur(id, blur * (worldTr.scale ?? 1));
    tmpC.putImageData(id, 0, 0);
  }

  if (layer.mask) _applyMask(tmpC, layer.mask, rctx, f, width, height);

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
