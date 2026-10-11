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
  let mScaleX = 1, mScaleY = 1, dBright = 0, dWrapX = 0, dWrapY = 0;
  let slices = null;

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
    // 자르기(split)로 나뉜 조각: 위상은 start/length 를 공유하고, 활성 창만 [winStart, winEnd)로 제한한다.
    // 기본값은 [start, start+length] → 기존 동작과 동일. 창을 나눠도 합치면 프레임별 결과가 같다.
    const winStart = clip.winStart ?? start;
    const winEnd   = clip.winEnd   ?? (start + length);
    const ownsStart = winStart <= start;              // 이 조각이 시작 쪽(before hold)을 담당
    const ownsEnd   = winEnd   >= (start + length);   // 이 조각이 끝 쪽(after hold)을 담당

    let t;
    if (f < start) {
      if ((hold === 'both' || hold === 'before') && ownsStart) t = 0;
      else continue;
    } else if (f < start + length) {
      if (f < winStart || f >= winEnd) continue;      // 이 조각의 활성 창 밖
      if (loop) {
        const rawT = cycle > 0 ? ((f - start) % cycle) / cycle : 0;
        t = clipEase ? ease(clipEase, rawT) : rawT;
      } else {
        const rawT = length > 0 ? (f - start) / length : 1;
        t = clipEase ? ease(clipEase, rawT) : rawT;
      }
    } else {
      if (seamProbe && loop && ctx.frameCount !== undefined && (start + length) >= ctx.frameCount && ownsEnd) {
        const rawT = cycle > 0 ? ((f - start) % cycle) / cycle : 0;
        t = clipEase ? ease(clipEase, rawT) : rawT;
      } else if ((hold === 'both' || hold === 'after') && ownsEnd) {
        t = 1;
      } else {
        continue;
      }
    }

    const env = ctx.env ?? { w: ctx.width, h: ctx.height, frameCount: ctx.frameCount };
    const result = motion.evaluate(t, params, env);

    dx        += (result.x        ?? 0) * gain;
    dy        += (result.y        ?? 0) * gain;
    dRotation += (result.rotation ?? 0) * gain;
    mScale    *= result.scale  !== undefined ? 1 + (result.scale  - 1) * gain : 1;
    mScaleX   *= result.scaleX !== undefined ? 1 + (result.scaleX - 1) * gain : 1;
    mScaleY   *= result.scaleY !== undefined ? 1 + (result.scaleY - 1) * gain : 1;
    mAlpha    *= result.alpha  !== undefined ? 1 + (result.alpha  - 1) * gain : 1;
    dBright   += (result.brightness ?? 0) * gain;
    dWrapX    += (result.wrapX ?? 0) * gain;
    dWrapY    += (result.wrapY ?? 0) * gain;
    if (result.slices && result.slices.length) {
      if (!slices) slices = [];
      for (const s of result.slices) slices.push(s);
    }
  }

  return {
    x: dx, y: dy, rotation: dRotation, scale: mScale, alpha: mAlpha,
    scaleX: mScaleX, scaleY: mScaleY, brightness: dBright, wrapX: dWrapX, wrapY: dWrapY, slices,
  };
}
