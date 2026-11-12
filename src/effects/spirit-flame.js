// 도깨비불 — 허공을 떠도는 혼불. 결정론·루프(정수 궤도). 시드 의존.
import { TAU, rgba, parseColor, clamp, hash2, frac } from './_fx-util.js';
import { LOOK_PARAM, lookOf, loopNoise } from './_fx-style.js';
import { world, overLife, camera, cyclesInLoop, WORLD_PARAMS } from './_fx-real.js';

export default {
  id: 'spirit-flame',
  name: '도깨비불',
  category: '판타지',
  description: '허공을 떠도는 푸른 혼불',
  thumbnail: { frame: 10, bg: '#040a10' },
  bleed: 24,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 8, min: 1, max: 60 },
    { key: 'size', label: '크기', type: 'float', default: 20, min: 6, max: 60, step: 1 },
    { key: 'speed', label: '떠도는 속도', type: 'int', default: 1, min: 0, max: 5 },
    { key: 'flicker', label: '흔들림', type: 'int', default: 3, min: 0, max: 8 },
    { key: 'color', label: '속 색', type: 'color', default: '#dff6ff' },
    { key: 'color2', label: '겉 색', type: 'color', default: '#4aa6ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.6 } : q)),
  ],
  presets: [
    { id: 'blue', label: '푸른 혼불', values: { color: '#dff6ff', color2: '#4aa6ff' } },
    { id: 'green', label: '귀화', values: { color: '#e6ffe6', color2: '#49d16a' } },
    { id: 'purple', label: '망령', values: { color: '#f3e6ff', color2: '#9a5cff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
    const count = Math.max(1, Math.round(p.count ?? 8));
    const size = p.size ?? 20;
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const flicker = Math.max(0, Math.round(p.flicker ?? 3));
    const inner = parseColor(p.color ?? '#dff6ff');
    const outer = parseColor(p.color2 ?? '#4aa6ff');
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const bx = rng(), by = rng();
      const ax = (0.1 + rng() * 0.2) * w, ay = (0.1 + rng() * 0.2) * h;
      const kx = 1 + Math.floor(rng() * 2); // 정수 바퀴
      const ky = 1 + Math.floor(rng() * 2);
      const ph = rng() * TAU, fph = rng() * TAU;
      const dirx = rng() < 0.5 ? 1 : -1;
      const rv = rng();
      const x = bx * w + Math.sin(progress * TAU * kx * speed * dirx + ph) * ax;
      const y = by * h + Math.cos(progress * TAU * ky * speed + ph) * ay;
      const fl = flicker === 0 ? 1 : 0.6 + 0.4 * Math.sin(progress * TAU * flicker + fph);
      const r = Math.max(0.5, size * (0.7 + 0.3 * rv) * fl);
      const a = op * (0.6 + 0.4 * fl);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(inner, a));
      g.addColorStop(0.4, rgba(outer, a * 0.7));
      g.addColorStop(1, rgba(outer, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};

// R30 실사(도깨비불·이그니스 파투스 기록): 늪·묘지 위 사람 가슴 높이쯤에 떠서 걷는 속도로 천천히 떠도는 작고 흐린 빛.
//   대개 옅은 파랑(가운데가 조금 노르스름), 열이 거의 없는 '차가운 불꽃' — 연기가 없고 바닥을 비출 만큼 밝지 않다.
//   잡으려 하면 사라지듯, 나타났다 사라지기를 되풀이한다. 모양은 작은 불꽃이 살짝 일렁이는 빛 덩이.
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const n = Math.max(1, Math.round(p.count ?? 8));
  const size = (p.size ?? 20) * 0.6;
  const speedK = Math.max(0, p.speed ?? 1);
  const flk = Math.max(0, p.flicker ?? 3);
  const inner = parseColor(p.color ?? '#dff6ff'), outer = parseColor(p.color2 ?? '#4aa6ff');
  const op = clamp(p.opacity ?? 0.9, 0, 1) * 0.75;           // 흐린 빛
  const seed = Math.floor(rng() * 1e6);
  const pr = W.t / W.L;
  camera(ctx, env, p, (c) => {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const H = (k) => hash2(i, k, seed);
      // 나타났다 사라짐: 루프 안에서 한 번(또는 두 번) 2~5초 머묾 — 앞뒤는 천천히
      const m = cyclesInLoop(Math.max(W.L, 4 + 3 * H(1)), W.L);
      const u = frac(pr * m + H(2));
      const vis = overLife([[0, 0], [0.18, 1], [0.7, 0.9], [1, 0]], u);
      if (vis < 0.02) continue;
      // 걷는 속도로 천천히 떠돎(루프에 닫히는 큰 원 + 위아래 출렁)
      const ax = (0.06 + 0.08 * H(3)) * w * speedK, ay = (0.02 + 0.02 * H(4)) * h;
      const ang = TAU * pr + H(5) * TAU;
      const x = (0.1 + 0.8 * H(6)) * w + Math.sin(ang) * ax;
      const y = (0.35 + 0.4 * H(7)) * h + Math.sin(ang * 2 + H(8) * 3) * ay;
      // 일렁임: 노이즈(루프 주기)로 세기·키가 조금씩
      const fl = flk === 0 ? 1 : 0.75 + 0.25 * (loopNoise(pr * flk * 4, i * 1.7, flk * 4, 0, seed % 997) * 2 - 1);
      const r = size * (0.7 + 0.3 * H(9));
      const a = op * vis * fl;
      // 바깥 흐린 빛무리(공기 중 산란)
      const g0 = c.createRadialGradient(x, y, 0, x, y, r * 3);
      g0.addColorStop(0, rgba(outer, a * 0.25)); g0.addColorStop(1, rgba(outer, 0));
      c.fillStyle = g0; c.beginPath(); c.arc(x, y, r * 3, 0, TAU); c.fill();
      // 작은 불꽃 덩이: 위로 살짝 길쭉, 가운데는 노르스름한 흰빛
      c.save();
      c.translate(x, y); c.scale(0.8, 1.15 + 0.1 * fl);
      const g = c.createRadialGradient(0, r * 0.15, 0, 0, 0, r);
      g.addColorStop(0, rgba({ r: 255, g: 250, b: 220 }, a * 0.85)); g.addColorStop(0.25, rgba(inner, a * 0.7));
      g.addColorStop(0.6, rgba(outer, a * 0.35)); g.addColorStop(1, rgba(outer, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.restore();
    }
    c.restore();
  }, { bloomK: 1 });
}
