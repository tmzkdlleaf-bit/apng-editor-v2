import { ease } from './easing.js';

// '#rgb' / '#rrggbb' → {r,g,b} 또는 null. core 전용(effects/_fx-util 에 의존하지 않음).
function _hex(s) {
  if (typeof s !== 'string') return null;
  let h = s.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function _toHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

// 키 값 종류별 보간. 숫자는 기존과 비트 단위로 같다.
function _interp(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  // 경로(R21) { closed, pts:[{x,y,ix,iy,ox,oy}] }: 점 개수가 같으면 모든 숫자 각각 보간, 다르면 계단.
  if (a && b && typeof a === 'object' && Array.isArray(a.pts) && Array.isArray(b.pts)) {
    if (a.pts.length !== b.pts.length) return a;
    const pts = a.pts.map((pa, i) => {
      const pb = b.pts[i];
      return {
        x:  (pa.x ?? 0)  + ((pb.x ?? 0)  - (pa.x ?? 0))  * t,
        y:  (pa.y ?? 0)  + ((pb.y ?? 0)  - (pa.y ?? 0))  * t,
        ix: (pa.ix ?? 0) + ((pb.ix ?? 0) - (pa.ix ?? 0)) * t,
        iy: (pa.iy ?? 0) + ((pb.iy ?? 0) - (pa.iy ?? 0)) * t,
        ox: (pa.ox ?? 0) + ((pb.ox ?? 0) - (pa.ox ?? 0)) * t,
        oy: (pa.oy ?? 0) + ((pb.oy ?? 0) - (pa.oy ?? 0)) * t,
      };
    });
    return { closed: a.closed, pts };
  }
  // 좌표 {x,y}: x·y 각각 같은 비율
  if (a && b && typeof a === 'object' && typeof b === 'object' && 'x' in a && 'x' in b) {
    return {
      x: (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * t,
      y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t,
    };
  }
  // 색 '#rrggbb': RGB 각각 보간 후 반올림
  if (typeof a === 'string' && typeof b === 'string') {
    const ca = _hex(a), cb = _hex(b);
    if (ca && cb) {
      return _toHex(
        Math.round(ca.r + (cb.r - ca.r) * t),
        Math.round(ca.g + (cb.g - ca.g) * t),
        Math.round(ca.b + (cb.b - ca.b) * t),
      );
    }
    return a; // 색이 아닌 문자열 → 계단(앞 키 유지)
  }
  return a; // 그 밖(참거짓 등) → 계단
}

// 앞쪽 키의 ease를 적용 (old/src/core/animator.js:101-109 동일 방식)
// 이징 'hold'(정지 키): 어떤 종류든 다음 키 전까지 앞 키 값을 유지한다.
export function evalProp(prop, f) {
  const keys = prop?.keys;
  if (!keys?.length) return prop?.value ?? 0;

  if (f <= keys[0].f) return keys[0].v;
  if (f >= keys[keys.length - 1].f) return keys[keys.length - 1].v;

  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1];
    if (lo.f <= f && f < hi.f) {
      if (lo.ease === 'hold') return lo.v;
      const span = hi.f - lo.f;
      const t = span === 0 ? 1 : (f - lo.f) / span;
      const et = ease(lo.ease ?? 'linear', t, lo.bezier);
      return _interp(lo.v, hi.v, et);
    }
  }
  return keys[keys.length - 1].v;
}
