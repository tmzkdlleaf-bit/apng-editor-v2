import { ease } from './easing.js';

// hold 값:
//   'both'  (기본): 시작 전 t=0, 끝난 뒤 t=1
//   'before': 시작 전 t=0, 끝난 뒤 적용 안 함
//   'after' : 시작 전 적용 안 함, 끝난 뒤 t=1
//   'none'  : 구간 밖 적용 안 함
//
// opts.seamProbe=true: 루프 클립 중 ctx.frameCount까지 걸쳐 있는 것은
// "끝 이후" 분기에서 hold 대신 자연 연장 위상을 사용한다 (이음매 감지용).
export function evalClips(layer, f, ctx, opts = {}) {
  const { seamProbe = false } = opts;
  let dx = 0, dy = 0, dRotation = 0, mScale = 1, mAlpha = 1;

  for (const clip of (layer.clips ?? [])) {
    const {
      motionId,
      start  = 0,
      length = 1,
      cycle: rawCycle,
      params = {},
      gain   = 1,
      ease: clipEase,
      loop   = false,
      hold   = 'both',
    } = clip;

    const motion = ctx.motions instanceof Map
      ? ctx.motions.get(motionId)
      : ctx.motions?.[motionId];
    if (!motion) continue;

    const cycle = rawCycle ?? length;

    let t;
    if (f < start) {
      if (hold === 'both' || hold === 'before') t = 0;
      else continue;
    } else if (f < start + length) {
      if (loop) {
        const rawT = cycle > 0 ? ((f - start) % cycle) / cycle : 0;
        t = clipEase ? ease(clipEase, rawT) : rawT;
      } else {
        const rawT = length > 0 ? (f - start) / length : 1;
        t = clipEase ? ease(clipEase, rawT) : rawT;
      }
    } else {
      if (seamProbe && loop && ctx.frameCount !== undefined && (start + length) >= ctx.frameCount) {
        const rawT = cycle > 0 ? ((f - start) % cycle) / cycle : 0;
        t = clipEase ? ease(clipEase, rawT) : rawT;
      } else if (hold === 'both' || hold === 'after') {
        t = 1;
      } else {
        continue;
      }
    }

    const result = motion.evaluate(t, params, { width: ctx.width, height: ctx.height });

    dx        += (result.x        ?? 0) * gain;
    dy        += (result.y        ?? 0) * gain;
    dRotation += (result.rotation ?? 0) * gain;
    mScale    *= result.scale !== undefined ? 1 + (result.scale - 1) * gain : 1;
    mAlpha    *= result.alpha !== undefined ? 1 + (result.alpha - 1) * gain : 1;
  }

  return { x: dx, y: dy, rotation: dRotation, scale: mScale, alpha: mAlpha };
}
