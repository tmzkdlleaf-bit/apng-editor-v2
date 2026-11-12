// 불티 — 불티가 위로 날아오르며 사그라듦(뜨거움→식음). 결정론·루프(frac 상승).
import { TAU, frac, mix, rgba, clamp } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world, emit, integrate, overLife, rgbStr, streak, camera, WORLD_PARAMS } from './_fx-real.js';
import { exposeTemp } from './flame.js';

export default {
  id: 'sparks',
  name: '불티',
  category: '파티클',
  lightBg: true, // R27 밝은 배경용(테두리·진하게) 지원
  description: '불티가 위로 날아오르며 식어 사라진다',
  thumbnail: { frame: 6, bg: '#0c0603' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 60, min: 1, max: 400 },
    { key: 'size', label: '크기', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'riseSpeed', label: '상승 속도', type: 'int', default: 2, min: 1, max: 6 },
    { key: 'wobble', label: '흔들림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#fff0a8' },
    { key: 'color2', label: '색 2', type: 'color', default: '#ff4a1e' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    { key: 'palette', label: '색(실사)', type: 'select', default: 'temp', options: [{ value: 'temp', label: '실제 온도색' }, { value: 'custom', label: '지정한 색' }] },
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.5 } : q)),
  ],
  presets: [
    { id: 'ember', label: '잉걸불', values: { color: '#ffd27a', color2: '#ff3a14' } },
    { id: 'magic', label: '마법 불꽃', values: { color: '#bfe0ff', color2: '#6a3cff', palette: 'custom' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
    const n = Math.max(1, Math.round(p.amount ?? 60));
    const size = p.size ?? 3;
    const rise = Math.max(1, Math.round(p.riseSpeed ?? 2));
    const wobble = clamp(p.wobble ?? 0.5, 0, 1);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng();
      const life = frac(by + progress * rise);              // 0 바닥 → 1 위
      const y = h - life * h * 1.0;
      const x = bx * w + Math.sin(progress * TAU * rise + ph * TAU) * wobble * w * 0.06;
      const r = size * (0.4 + 0.8 * rs) * (1 - 0.6 * life);
      const a = op * (1 - life) * (0.5 + 0.5 * rs);
      if (a <= 0.01 || r <= 0.3) continue;
      const col = mix(p.color ?? '#fff0a8', p.color2 ?? '#ff4a1e', life);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(0.4, rgba(col, a * 0.6));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
    }
  },
};

// R30 실사(지침 4-1 불티, 자료집 2-2): 처음 1500~1950 K 로 태어나 위로 튀었다가 저항으로 느려지고 식는다
//   (흰 → 노랑 → 주황 → 빨강 → 사라짐). 뜨겁고 빠른 무리 30% / 덜 뜨겁고 느린 무리 70%.
//   일부(20%)는 중간에 터져 2~3조각으로 갈라진다. 꼬리 = 셔터 흐림.
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const n = Math.max(1, Math.round(p.amount ?? 60));
  const sizeK = Math.max(0.3, (p.size ?? 3) / 3);
  const riseK = Math.max(1, p.riseSpeed ?? 2) / 2;
  const wob = clamp(p.wobble ?? 0.5, 0, 1);
  const op = clamp(p.opacity ?? 1, 0, 1);
  const useTemp = (p.palette ?? 'temp') === 'temp';
  const seed = Math.floor(rng() * 1e6);
  const c1 = p.color ?? '#fff0a8', c2 = p.color2 ?? '#ff4a1e';
  const colorAt = (T0, u) => {
    if (useTemp) return exposeTemp(T0 - (T0 - 850) * u);
    const m = mix(c1, c2, u); return [m.r, m.g, m.b, 1 - u * 0.6];
  };
  const drawOne = (c, x, y, vx, vy, T0, u, R, wd) => {
    const col = colorAt(T0, u);
    const a = op * overLife([[0, 0], [0.03, 1], [0.65, 0.85], [1, 0]], u) * col[3];
    if (a < 0.01) return;
    streak(c, x, y, vx, vy, W, wd, rgbStr(col), a);
  };
  camera(ctx, env, p, (c) => {
    c.save();
    c.globalCompositeOperation = 'lighter';
    emit({ count: n, life: [0.8, 2.2], gap: 0.25, seed }, W.t, W.L, (i, age, u, R) => {
      const hot = R(1) < 0.3;
      const T0 = hot ? 1950 : 1500 + 250 * R(2);
      const v0 = (hot ? 2.5 + 2 * R(3) : 1 + 1.5 * R(3)) * riseK;
      const x0 = (R(4) * 1.1 - 0.05) * w, y0 = h * (1.02 - 0.1 * R(5));
      const vx0 = (R(6) - 0.5) * 1.4;
      const mo = integrate(0, 0, vx0, -v0, 0, -0.5, hot ? 0.9 : 1.6, age);
      const sway = Math.sin(age * (2 + 2 * R(7)) + R(8) * TAU) * 0.06 * wob;
      const x = x0 + (mo.x + sway) * W.pxPerM, y = y0 + mo.y * W.pxPerM;
      const wd = Math.max(0.7, 1.5 * sizeK * (hot ? 1.1 : 0.9));
      // 터짐: 20% 는 수명 45% 지점에서 2~3조각으로
      const splitU = 0.45;
      if (R(9) < 0.2 && u > splitU) {
        const life = age / u, ts = life * splitU;
        const ms = integrate(0, 0, vx0, -v0, 0, -0.5, hot ? 0.9 : 1.6, ts);
        const k = 2 + (R(10) < 0.5 ? 1 : 0);
        for (let j = 0; j < k; j++) {
          const ang = R(11 + j) * TAU;
          const da = age - ts;
          const mf = integrate(ms.x, ms.y, ms.vx + Math.cos(ang) * 1.5, ms.vy + Math.sin(ang) * 1.5, 0, 1.2, 2.2, da);
          const uf = clamp(splitU + (u - splitU) * 1.6, 0, 1);       // 조각은 더 빨리 식는다
          drawOne(c, x0 + mf.x * W.pxPerM, y0 + mf.y * W.pxPerM, mf.vx * W.pxPerM, mf.vy * W.pxPerM, T0 + 150, uf, R, wd * 0.7);
        }
        return;
      }
      drawOne(c, x, y, mo.vx * W.pxPerM, mo.vy * W.pxPerM, T0, u, R, wd);
    });
    c.restore();
  }, { bloomK: 1 });
}
