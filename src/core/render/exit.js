import { createRng } from './rng.js';

// 소산 퇴장 (old/src/core/render/composite.js:renderDisintegrate 이식)
// exit: { type:'disintegrate', startF, endF }
export function renderExit(ctx, src, worldTr, layer, f, width, height, pool) {
  const exit = layer.exit;
  if (!exit || exit.type !== 'disintegrate') return false;
  const { startF, endF } = exit;
  if (f < startF || f > endF) return false;

  const progress = (f - startF) / Math.max(1, endF - startF);
  const seed = (layer.seed ?? 1) >>> 0;

  const srcW = src.width ?? src.naturalWidth ?? width;
  const srcH = src.height ?? src.naturalHeight ?? height;

  const cellSize = Math.max(2, Math.round(Math.min(srcW, srcH) / 40));
  const cols     = Math.ceil(srcW / cellSize);
  const rows     = Math.ceil(srcH / cellSize);

  // 결정론적 셀 파라미터: seed + 크기가 같으면 항상 같은 배열
  const rng = createRng(seed + rows * 1000 + cols);
  const cellParams = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cellParams.push({
        phase:    rng() * 0.4,
        speedY:   0.6 + rng() * 1.6,
        swayAmp:  (rng() - 0.5) * 0.8,
        swayFreq: 0.6 + rng() * 2.4,
        swayPhs:  rng() * Math.PI * 2,
        driftX:   (rng() - 0.5) * 0.25,
      });
    }
  }

  const tmp = pool.borrow(srcW, srcH);
  const tc  = tmp.getContext('2d');
  tc.drawImage(src, 0, 0, srcW, srcH);

  const upDist = Math.min(srcW, srcH) * 1.4;
  const totalAlpha = layer.opacity * worldTr.alpha;

  ctx.save();
  ctx.translate(width / 2 + worldTr.x, height / 2 + worldTr.y);
  ctx.rotate(worldTr.rotation * Math.PI / 180);
  ctx.scale(worldTr.scale, worldTr.scale);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cp     = cellParams[idx++];
      const localP = Math.max(0, Math.min(1, (progress - cp.phase) / Math.max(0.01, 1 - cp.phase)));
      const sx = c * cellSize, sy = r * cellSize;
      const sw = Math.min(cellSize, srcW - sx);
      const sh = Math.min(cellSize, srcH - sy);
      const dx = sx - srcW / 2, dy = sy - srcH / 2;

      if (localP <= 0) {
        ctx.globalAlpha = totalAlpha;
        ctx.drawImage(tmp, sx, sy, sw, sh, dx, dy, sw, sh);
      } else {
        const t     = localP * localP * (3 - 2 * localP);
        const alpha = totalAlpha * (1 - t) * (1 - t);
        if (alpha < 0.004) continue;
        const oY   = -upDist * cp.speedY * t;
        const sway = cp.swayAmp * Math.sin(cp.swayFreq * progress * Math.PI * 2 + cp.swayPhs);
        const oX   = srcW * (cp.driftX + sway * 0.4) * t;
        const sc   = Math.max(0.01, 1 - 0.5 * t);
        ctx.globalAlpha = alpha;
        ctx.drawImage(tmp, sx, sy, sw, sh,
          dx + oX + sw * (1 - sc) / 2,
          dy + oY + sh * (1 - sc) / 2,
          sw * sc, sh * sc);
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
  pool.release(tmp);
  return true;
}
