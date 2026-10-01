// 인스턴스 레이어 — 마스터 그룹을 참조해 오버라이드 적용 후 렌더
// 인스턴스는 독립된 변환(worldTr)을 가지며, 마스터 그룹의 childOrder를 공유한다.
// 오버라이드: instance.overrides[childId] = { text, style, assetId, ... }

export function renderInstanceLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, width, height, f } = rctx;
  const masterId = layer.masterId;
  const master   = masterId ? doc.layers[masterId] : null;
  if (!master || master.type !== 'group') return;

  const overrides  = layer.overrides ?? {};
  const childOrder = master.childOrder ?? [];
  const offscreen  = pool.borrow(width, height);
  const offCtx     = offscreen.getContext('2d');

  for (const childId of childOrder) {
    const childBase = doc.layers[childId];
    if (!childBase || childBase.hidden) continue;

    // 오버라이드를 얕은 병합으로 적용
    const child = overrides[childId]
      ? { ...childBase, ...overrides[childId] }
      : childBase;

    renderLayerFn(offCtx, child, worldTr, rctx);
  }

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

  const blendOp = _blendOp(layer.blend);
  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendOp;
  outputCtx.drawImage(offscreen, 0, 0);
  outputCtx.restore();
  pool.release(offscreen);
}

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}
