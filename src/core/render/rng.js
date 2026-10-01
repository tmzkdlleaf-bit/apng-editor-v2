// mulberry32 — 같은 seed면 같은 수열 (렌더 경로 전용 PRNG)
export function createRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
