// 연기 — 피어오르는 연기. 결정론·루프(frac 상승).
import { TAU, frac, parseColor, rgba, clamp, mix } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { erodeMask, world, emit, integrate, overLife, camera, WORLD_PARAMS } from './_fx-real.js';

export default {
  id: 'smoke',
  name: '연기',
  category: '날씨',
  description: '부드럽게 피어오르는 연기',
  thumbnail: { frame: 8, bg: '#0c0c10' },
  bleed: 30,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 24, min: 1, max: 150 },
    { key: 'spread', label: '퍼짐', type: 'float', default: 0.5, min: 0.1, max: 1.5, step: 0.01 },
    { key: 'riseSpeed', label: '상승 속도', type: 'int', default: 1, min: 1, max: 5 },
    { key: 'wind', label: '바람', type: 'float', default: 0.2, min: -1, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#b9bcc6' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    { key: 'wisps', label: '실 같은 결(실사)', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'light', label: '빛 방향(실사)', type: 'select', default: 'back',
      options: [{ value: 'back', label: '뒤에서(역광)' }, { value: 'top', label: '위에서' }, { value: 'left', label: '왼쪽에서' }, { value: 'right', label: '오른쪽에서' }] },
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0 } : q)),
  ],
  presets: [
    { id: 'gray', label: '회색 연기', values: { color: '#b9bcc6' } },
    { id: 'dark', label: '검은 연기', values: { color: '#5a5a62', opacity: 0.7 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
    const n = Math.max(1, Math.round(p.amount ?? 24));
    const spread = clamp(p.spread ?? 0.5, 0.1, 1.5);
    const rise = Math.max(1, Math.round(p.riseSpeed ?? 1));
    const wind = clamp(p.wind ?? 0.2, -1, 1);
    const col = parseColor(p.color ?? '#b9bcc6');
    const op = clamp(p.opacity ?? 0.5, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const maxd = Math.max(w, h);

    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng();
      const life = frac(by + progress * rise);              // 0 바닥 → 1 위
      const y = h - life * h * 1.05;
      const x = bx * w + wind * life * w * 0.35 + Math.sin(progress * TAU * rise + ph * TAU) * spread * maxd * 0.05;
      const r = (0.04 + 0.12 * rs + life * 0.18) * spread * maxd;
      const a = op * (0.15 + 0.5 * rs) * 4 * life * (1 - life); // 생성·소멸 시 0
      if (a <= 0.003) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  },
};

// R30 실사(지침 4-1 연기, 자료집 2-3): 덩어리(퍼프)가 부력으로 오르며 저항으로 느려지고, 살면서 2~3배로 커지며 옅어진다(3~6초).
//   빛: 역광이면 얇은 가장자리가 밝고 두꺼운 가운데가 어둡다(스스로 그늘). 옆·위 빛이면 빛 쪽이 밝고 반대쪽이 어둡다.
//   가장 어두운 색은 순흑이 아니라 연기 색을 섞은 짙은 회색.
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const n = Math.max(1, Math.round((p.amount ?? 24) * 1.1));
  const spread = clamp(p.spread ?? 0.5, 0.1, 1.5);
  const riseK = Math.max(1, p.riseSpeed ?? 1);
  const wind = clamp(p.wind ?? 0.2, -1, 1) * 0.8;          // m/s
  const baseHex = p.color ?? '#b9bcc6';
  const base = parseColor(baseHex);
  const op = clamp(p.opacity ?? 0.5, 0, 1);
  const lightM = p.light ?? 'back';
  const lit = mix(baseHex, '#ffffff', 0.35), shade = mix(baseHex, '#1c1c22', 0.55);
  const L = (c, a) => rgba(c, a);
  const seed = Math.floor(rng() * 1e6);
  const dir = lightM === 'top' ? [0, -1] : lightM === 'left' ? [-1, 0] : lightM === 'right' ? [1, 0] : null;
  const fil = clamp(p.wisps ?? 0.6, 0, 1);
  camera(ctx, env, p, (c0) => {
    // R31: 덩어리를 임시 캔버스에 그린 뒤 흐르는 노이즈로 부드럽게 침식 → 솜뭉치 대신 실 같은 결
    const tmp = fil > 0 ? env.borrow(c0.canvas.width, c0.canvas.height) : null;
    const c = tmp ? tmp.getContext('2d') : c0;
    if (tmp) c.setTransform(c0.getTransform());
    emit({ count: n, life: [3, 6], seed }, W.t, W.L, (i, age, u, R) => {
      const x0 = (R(1) * 1.1 - 0.05) * w, y0 = h * (1.05 - 0.08 * R(2));
      const m = integrate(0, 0, wind * (0.6 + 0.8 * R(3)), -(0.25 + 0.35 * R(4)) * riseK, wind * 0.15, 0, 0.35, age);
      const curl = Math.sin(age * (0.8 + 0.6 * R(5)) + R(6) * TAU) * 0.12;
      const x = x0 + (m.x + curl) * W.pxPerM, y = y0 + m.y * W.pxPerM;
      const r0 = (0.25 + 0.3 * R(7)) * spread * W.pxPerM;
      const r = r0 * (1 + 2 * u);                            // 2~3배로 커짐
      const a = op * 0.5 * (1 + 0.8 * fil) * overLife([[0, 0], [0.12, 1], [0.55, 0.65], [1, 0]], u) * (0.6 + 0.4 * R(8));
      if (a < 0.004) return;
      let g;
      if (dir) {
        // 빛 쪽으로 치우친 밝은 면 → 반대쪽 그늘
        const lx = x + dir[0] * r * 0.45, ly = y + dir[1] * r * 0.45;
        g = c.createRadialGradient(lx, ly, r * 0.05, x, y, r);
        g.addColorStop(0, L(lit, a)); g.addColorStop(0.35, L(base, a * 0.75)); g.addColorStop(0.65, L(shade, a * 0.35)); g.addColorStop(1, L(shade, 0));
      } else {
        // 역광: 가운데(두꺼움) 어둡고 가장자리(얇음) 밝게 빛이 샌다
        g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, L(shade, a * 0.9)); g.addColorStop(0.45, L(base, a * 0.55)); g.addColorStop(0.75, L(lit, a * 0.22)); g.addColorStop(1, L(lit, 0));
      }
      c.globalAlpha = 1; c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    });
    if (tmp) {
      const cyc = Math.max(1, Math.round(W.L / 1.5));      // 결 흐름 위상: 루프 안 정수 번
      const m = erodeMask(env, w, h, { cell: 6, freq: 5, thr: 0.5 - 0.25 * (1 - fil), soft: 0.35, fil: 0.35 * fil, flow: (W.t / W.L) * cyc, drift: 0.5 * (W.L / cyc) * riseK, seed: seed % 997, warp: 0.8 });
      c.save(); c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = true;
      c.drawImage(m, 0, 0, m.width, m.height, 0, 0, w, h); c.restore();
      env.release(m);
      c0.save(); c0.setTransform(1, 0, 0, 1, 0, 0); c0.globalAlpha = 1; c0.drawImage(tmp, 0, 0); c0.restore();
      env.release(tmp);
    }
  }, { bloomK: 1 });
}
