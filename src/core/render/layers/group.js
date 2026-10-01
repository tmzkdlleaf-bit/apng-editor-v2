// 그룹 레이어 렌더러 — 오프스크린 캔버스에 자식 그린 뒤 합성

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

export function renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, width, height, f } = rctx;

  const offscreen  = pool.borrow(width, height);
  const offCtx     = offscreen.getContext('2d');

  // 그룹 자체 카메라 없음; 자식을 그룹의 worldTr 기준으로 합성
  const childOrder = layer.childOrder ?? [];

  for (const childId of childOrder) {
    const child = doc.layers[childId];
    if (!child || child.hidden) continue;

    // 자식 변환을 부모(worldTr)와 합성
    // renderLayerFn은 자식의 고유 변환을 이미 rctx에서 evalTransform으로 얻으므로
    // 여기서는 composeTransforms 결과를 parentTr로 넘긴다.
    renderLayerFn(offCtx, child, worldTr, rctx);
  }

  // 그룹 마스크
  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
      if (maskCanvas) {
        offCtx.setTransform(1, 0, 0, 1, 0, 0);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(maskCanvas, 0, 0);
        offCtx.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }
  }

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = _blendOp(layer.blend);
  outputCtx.drawImage(offscreen, 0, 0);
  outputCtx.restore();
  pool.release(offscreen);
}
