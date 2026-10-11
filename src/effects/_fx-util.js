// 효과 공용 헬퍼(효과가 아님 — registry 에 등록하지 않는다). 결정론 유지(Math.random 금지).
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const frac = (x) => x - Math.floor(x);
const fade = (t) => t * t * (3 - 2 * t);

// '#rgb' / '#rrggbb' → {r,g,b}. 실패 시 흰색.
export function parseColor(hex) {
  if (typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
  let s = hex.trim().replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function withAlpha(color, a) {
  const { r, g, b } = parseColor(color);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}
export function mix(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  return { r: Math.round(lerp(a.r, b.r, t)), g: Math.round(lerp(a.g, b.g, t)), b: Math.round(lerp(a.b, b.b, t)) };
}
export function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${clamp(a, 0, 1)})`; }

// 정수 해시 → [0,1)
export function hash2(x, y, seed = 0) {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 83492791)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// 매끄러운 2D 값 노이즈 (연기·안개·코스틱용). 결정론.
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed), v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed), v11 = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
}
// 옥타브 합산 노이즈
export function fbm(x, y, seed = 0, oct = 3) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) { sum += amp * valueNoise(x * freq, y * freq, seed + i * 101); amp *= 0.5; freq *= 2; }
  return sum;
}
