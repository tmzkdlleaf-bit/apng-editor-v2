// 반딧불(R28e) — 천천히 떠다니며 깜빡이는 빛 점. 결정론·루프(정수 주기).
import { TAU, clamp, parseColor, rgba, hash2, frac } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world, overLife, streak, camera, WORLD_PARAMS } from './_fx-real.js';

export default {
  id: 'fireflies',
  name: '반딧불',
  category: '날씨',
  lightBg: true,
  description: '천천히 떠다니며 깜빡이는 빛 점(여름밤·숲·몽환)',
  thumbnail: { frame: 5, bg: '#0a120c' },
  bleed: 10,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 30, min: 1, max: 200 },
    { key: 'size', label: '크기', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#d8ff7a' },
    { key: 'blink', label: '깜빡임 횟수', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'roam', label: '떠다니는 범위', type: 'float', default: 0.08, min: 0, max: 0.3, step: 0.01 },
    { key: 'glow', label: '빛 번짐', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'band', label: '높이 범위', type: 'select', default: 'all',
      options: [{ value: 'all', label: '화면 전체' }, { value: 'low', label: '아래쪽' }] },
    LOOK_PARAM('real'),
    { key: 'pattern', label: '빛 내는 방식(실사)', type: 'select', default: 'j',
      options: [{ value: 'j', label: '길게·J자(0.7초 / 6초마다)' }, { value: 'quick', label: '짧게·자주(0.4초 / 2초마다)' }, { value: 'double', label: '두 번씩(2초 간격, 5초 쉼)' }] },
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.6 } : q)),
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
    const n = Math.max(1, Math.round(p.count ?? 30));
    const size = Math.max(1, p.size ?? 3);
    const col = parseColor(p.color ?? '#d8ff7a');
    const blink = Math.max(1, Math.round(p.blink ?? 2));
    const roam = clamp(p.roam ?? 0.08, 0, 0.3);
    const glow = clamp(p.glow ?? 0.6, 0, 1);
    const low = p.band === 'low';
    const prog = f / Math.max(1, frameCount);
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), p1 = rng(), p2 = rng(), p3 = rng(), sz = rng();
      const x = (bx + roam * (Math.sin(TAU * prog + p1 * TAU) + 0.5 * Math.sin(TAU * 2 * prog + p2 * TAU))) * w;
      const y = ((low ? 0.55 + 0.45 * by : by) + roam * 0.8 * Math.sin(TAU * prog + p2 * TAU + 1.3)) * h;
      // 깜빡임: 대부분 어둡고 가끔 밝게(부드럽게)
      const b = Math.pow(Math.max(0, Math.sin(TAU * blink * prog + p3 * TAU)), 3);
      if (b < 0.02) continue;
      const r = size * (0.6 + 0.6 * sz);
      if (glow > 0) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * (3 + 5 * glow));
        g.addColorStop(0, rgba(col, 0.55 * b * glow)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * (3 + 5 * glow), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = rgba({ r: Math.min(255, col.r + 60), g: Math.min(255, col.g + 40), b: Math.min(255, col.b + 60) }, b);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  },
};

// R30 실사(지침 4-1 반딧불, 자료집 2-10): 대표종은 0.6~0.8초 빛을 내고 5~7초마다 반복, 빛을 내는 동안 위로 휘며 날아 J자.
//   대부분 시간은 꺼져 있다(켜짐 : 꺼짐 ≈ 1 : 8). 루프가 주기보다 짧으면 "이번 루프에 빛내는 개체"만 빛난다(지침 5-2).
//   빛은 빠르게 차오르고 잠깐 머물다 꺼진다. 날아가는 동안의 빛 = 짧은 셔터 흐림.
const PATTERNS = {
  j: { on: 0.7, period: 6, pulses: 1, gap: 0, rise: 0.45 },
  quick: { on: 0.4, period: 2, pulses: 1, gap: 0, rise: 0.15 },
  double: { on: 0.35, period: 7, pulses: 2, gap: 2, rise: 0.1 },
};
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const n = Math.max(1, Math.round(p.count ?? 30));
  const col = parseColor(p.color ?? '#d8ff7a');
  const sizeK = Math.max(0.3, (p.size ?? 3) / 3);
  const roam = clamp(p.roam ?? 0.08, 0, 0.3);
  const low = p.band === 'low';
  const pat = PATTERNS[p.pattern] ?? PATTERNS.j;
  const seed = Math.floor(rng() * 1e6);
  // 루프 안 반복 횟수: 주기를 루프에 맞춘다. 루프가 주기보다 짧으면 1번, 대신 빛내는 개체 비율을 줄인다.
  const m = Math.max(1, Math.round(W.L / pat.period));
  const per = W.L / m;
  const share = Math.min(1, W.L / pat.period);
  const lightOf = (tt) => {                       // 한 번의 빛: 0.12초 차오름 → 머묾 → 0.2초 꺼짐
    if (tt < 0 || tt > pat.on) return 0;
    return overLife([[0, 0], [Math.min(0.17, 0.4), 1], [0.7, 0.9], [1, 0]], tt / pat.on);
  };
  camera(ctx, env, p, (c) => {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const H = (k) => hash2(i, k, seed);
      if (H(1) > share) continue;                 // 이번 루프에 빛내지 않는 개체
      // 천천히 떠도는 기본 위치(루프 이음매 없게 정수 주기)
      const bx = H(2), by = low ? 0.55 + 0.45 * H(3) : H(3);
      const pr = W.t / W.L;
      const x0 = (bx + roam * (Math.sin(TAU * pr + H(4) * TAU) + 0.5 * Math.sin(TAU * 2 * pr + H(5) * TAU))) * w;
      const y0 = (by + roam * 0.8 * Math.sin(TAU * pr + H(5) * TAU + 1.3)) * h;
      const tIn = frac(W.t / per + H(6)) * per;   // 이 주기 안 시각
      for (let k = 0; k < pat.pulses; k++) {
        const tt = tIn - k * pat.gap;
        const L = lightOf(tt);
        if (L < 0.02) continue;
        // J자: 빛내는 동안 위로 휘며 오른다(약 rise m). 방향은 개체마다.
        const s = tt / pat.on, dir = H(7) < 0.5 ? -1 : 1;
        const dx = dir * 0.12 * Math.sin(s * Math.PI * 0.5), dy = -pat.rise * s * s;
        const vx = dir * 0.12 * Math.cos(s * Math.PI * 0.5) * Math.PI * 0.5 / pat.on, vy = -pat.rise * 2 * s / pat.on;
        const x = x0 + dx * W.pxPerM, y = y0 + dy * W.pxPerM;
        const r = 1.8 * sizeK;
        streak(c, x, y, vx * W.pxPerM, vy * W.pxPerM, W, r * 2, rgba(col, 1), L);
        // 몸 주위로 퍼지는 빛(공기·눈의 산란)
        const g = c.createRadialGradient(x, y, 0, x, y, r * 7);
        g.addColorStop(0, rgba(col, 0.35 * L)); g.addColorStop(1, rgba(col, 0));
        c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 7, 0, TAU); c.fill();
      }
    }
    c.restore();
  }, { bloomK: 1 });
}
