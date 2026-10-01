import { applyAdjust, hasAdjust, applyBlur } from '../adjust.js';
import { renderExit } from '../exit.js';

// 외곽선: 실루엣을 여러 각도로 그려 외곽선 효과 (ctx.filter 미사용)
function _drawOutline(ctx, src, srcW, srcH, outline, pool, w, h) {
  const { color = '#ffffff', width: ow = 2, quality = 2 } = outline;
  const steps = Math.max(4, Math.round(quality) * 8);

  const sil  = pool.borrow(w, h);
  const silC = sil.getContext('2d');
  silC.drawImage(src, 0, 0);
  silC.globalCompositeOperation = 'source-in';
  silC.fillStyle = color;
  silC.fillRect(0, 0, w, h);
  silC.globalCompositeOperation = 'source-over';

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(angle) * ow, Math.sin(angle) * ow);
  }
  pool.release(sil);
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

  const ax = (layer.anchor?.x ?? 0.5), ay = (layer.anchor?.y ?? 0.5);

  // 캐시 키: assetId + adjust + tint + outline
  const cacheKey = `${layer.id}:img:${layer.assetId}:${JSON.stringify([layer.adjust, layer.tint, layer.outline])}`;
  let contentCanvas = cache.get(cacheKey);

  if (!contentCanvas) {
    // 원본 → 보정 → 색 덮기 → 외곽선 포함 캐시 캔버스 생성
    const cc  = pool.borrow(bW, bH);
    const ccx = cc.getContext('2d');

    ccx.drawImage(bitmap, 0, 0, bW, bH);

    if (hasAdjust(layer.adjust)) {
      const id = ccx.getImageData(0, 0, bW, bH);
      applyAdjust(id, layer.adjust);
      ccx.putImageData(id, 0, 0);
      cache.incAdjustCount();
      // 블러는 캐시 밖에서 처리하므로 여기서는 생략
    }

    if (layer.tint) {
      _applyTint(ccx, bW, bH, layer.tint);
    }

    // 외곽선은 출력 캔버스 크기 기준으로 그려야 해서 contentCanvas와 별도
    contentCanvas = cc;
    cache.set(cacheKey, contentCanvas);
  }

  // 블러: 캐시 후 별도 처리 (출력 크기 기준이므로 캐시 불가)
  const blur = layer.adjust?.blur ?? 0;

  // 변환 적용해 출력 캔버스에 그리기
  const hasOutline = layer.outline?.width > 0;
  const hasBlur    = blur > 0;

  if (!hasOutline && !hasBlur && !layer.mask) {
    // 단순 경로: 직접 출력에 그리기
    outputCtx.save();
    _applyTransform(outputCtx, worldTr, width, height);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = _blendOp(layer.blend);
    outputCtx.drawImage(contentCanvas, -bW * ax, -bH * ay);
    outputCtx.restore();
    return;
  }

  // 복잡한 경로: 작업 캔버스에 그린 뒤 합성
  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  _applyTransform(tmpC, worldTr, width, height);

  if (hasOutline) {
    const silW = width, silH = height;
    // outline을 먼저: 실루엣이 캔버스 좌표로 필요하므로 inline draw
    const steps = Math.max(4, Math.round((layer.outline.quality ?? 2)) * 8);
    const ow    = layer.outline.width ?? 2;
    const color = layer.outline.color ?? '#ffffff';
    const sil  = pool.borrow(silW, silH);
    const silC = sil.getContext('2d');
    silC.save();
    _applyTransform(silC, worldTr, width, height);
    silC.drawImage(contentCanvas, -bW * ax, -bH * ay);
    silC.restore();
    silC.globalCompositeOperation = 'source-in';
    silC.fillStyle = color;
    silC.fillRect(0, 0, silW, silH);
    silC.globalCompositeOperation = 'source-over';
    tmpC.restore();
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      tmpC.drawImage(sil, Math.cos(angle) * ow, Math.sin(angle) * ow);
    }
    pool.release(sil);
    tmpC.save();
    _applyTransform(tmpC, worldTr, width, height);
  }

  tmpC.drawImage(contentCanvas, -bW * ax, -bH * ay);
  tmpC.restore();

  if (hasBlur) {
    const id = tmpC.getImageData(0, 0, width, height);
    applyBlur(id, blur * (worldTr.scale ?? 1));
    tmpC.putImageData(id, 0, 0);
  }

  // 마스크 적용
  if (layer.mask) {
    _applyMask(tmpC, layer.mask, rctx, width, height);
  }

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = _blendOp(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}

function _applyTransform(ctx, worldTr, w, h) {
  ctx.translate(w / 2 + (worldTr.x ?? 0), h / 2 + (worldTr.y ?? 0));
  ctx.rotate((worldTr.rotation ?? 0) * Math.PI / 180);
  ctx.scale(worldTr.scale ?? 1, worldTr.scale ?? 1);
}

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

function _applyMask(tmpC, maskOpts, rctx, w, h) {
  const { sourceId, mode = 'alpha', invert = false, feather = 0 } = maskOpts;
  const { doc, f, pool } = rctx;
  const sourceLayer = doc.layers[sourceId];
  if (!sourceLayer) return;

  const { renderMask } = rctx;
  if (!renderMask) return;

  const maskCanvas = renderMask(sourceLayer, f, w, h, { mode, invert, feather });
  if (!maskCanvas) return;

  tmpC.setTransform(1, 0, 0, 1, 0, 0);
  tmpC.globalAlpha = 1;
  tmpC.globalCompositeOperation = 'destination-in';
  tmpC.drawImage(maskCanvas, 0, 0);
  tmpC.globalCompositeOperation = 'source-over';
  pool.release(maskCanvas);
}
