import { applyBlur } from './adjust.js';

// 마스크 소스를 w×h 캔버스에 렌더해 반환 (소스가 숨김이어도 마스크는 그린다).
// opts: { mode:'alpha'|'luma', invert:bool, feather:number, expand:number }
export function renderMask(sourceLayer, f, w, h, opts, pool, renderLayerFn) {
  const { mode='alpha', invert=false, feather=0, expand=0 } = opts ?? {};

  const mc  = pool.borrow(w, h);
  const ctx = mc.getContext('2d');

  // 소스 레이어를 마스크 캔버스에 렌더 (숨김 여부 무시)
  if (renderLayerFn) {
    renderLayerFn(ctx, sourceLayer, f);
  }

  // luma → alpha 변환
  if (mode === 'luma') {
    const id = ctx.getImageData(0, 0, w, h);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i + 3]   = Math.round(luma * d[i + 3] / 255);
    }
    ctx.putImageData(id, 0, 0);
  }

  // 확장 (여러 각도로 복사하여 팽창)
  if (expand > 0) {
    const expC = pool.borrow(w, h);
    const ec   = expC.getContext('2d');
    const steps = Math.max(4, Math.round(expand) * 4);
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ec.drawImage(mc, Math.cos(angle) * expand, Math.sin(angle) * expand);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(expC, 0, 0);
    pool.release(expC);
  }

  // 페더 (ctx.filter 없이 박스 블러)
  if (feather > 0) {
    const id = ctx.getImageData(0, 0, w, h);
    applyBlur(id, feather);
    ctx.putImageData(id, 0, 0);
  }

  // 알파 반전
  if (invert) {
    const id = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255 - id.data[i];
    ctx.putImageData(id, 0, 0);
  }

  return mc;
}

// outputCtx에 레이어 내용 + 마스크를 적용해 합성.
// drawFn(tmpCtx): 레이어를 tmpCtx에 그리는 함수.
export function compositeWithMask(outputCtx, layer, totalAlpha, drawFn, maskCanvas, pool, w, h) {
  const { blend = 'normal' } = layer;
  const composite = _blendToComposite(blend);

  if (maskCanvas) {
    const tmp = pool.borrow(w, h);
    const tc  = tmp.getContext('2d');
    tc.globalAlpha = totalAlpha;
    drawFn(tc);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(maskCanvas, 0, 0);
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalCompositeOperation = composite;
    outputCtx.drawImage(tmp, 0, 0);
    outputCtx.restore();
    pool.release(tmp);
  } else {
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = composite;
    const tmp = pool.borrow(w, h);
    drawFn(tmp.getContext('2d'));
    outputCtx.drawImage(tmp, 0, 0);
    outputCtx.restore();
    pool.release(tmp);
  }
}

function _blendToComposite(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}
