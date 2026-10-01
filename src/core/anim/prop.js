import { ease } from './easing.js';

// 앞쪽 키의 ease를 적용 (old/src/core/animator.js:101-109 동일 방식)
export function evalProp(prop, f) {
  const keys = prop?.keys;
  if (!keys?.length) return prop?.value ?? 0;

  if (f <= keys[0].f) return keys[0].v;
  if (f >= keys[keys.length - 1].f) return keys[keys.length - 1].v;

  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1];
    if (lo.f <= f && f < hi.f) {
      const span = hi.f - lo.f;
      const t = span === 0 ? 1 : (f - lo.f) / span;
      const et = ease(lo.ease ?? 'linear', t, lo.bezier);
      return lo.v + (hi.v - lo.v) * et;
    }
  }
  return keys[keys.length - 1].v;
}
