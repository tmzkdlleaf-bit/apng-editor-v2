// 눈 — 떨어지는 눈송이(겹/원근). 결정론·루프(frac 낙하, 정수 바퀴).
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'snow',
  name: '눈',
  category: '날씨',
  description: '흔들리며 떨어지는 눈송이',
  thumbnail: { frame: 7, bg: '#0a0e18' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 120, min: 1, max: 600 },
    { key: 'size', label: '크기', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'sway', label: '흔들림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'wind', label: '바람', type: 'float', default: 0.15, min: -1, max: 1, step: 0.01 },
    { key: 'layers', label: '겹 수', type: 'int', default: 3, min: 1, max: 5 },
    { key: 'color', label: '색', type: 'color', default: '#f2f7ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 120));
    const size = p.size ?? 3;
    const sway = clamp(p.sway ?? 0.5, 0, 1);
    const wind = clamp(p.wind ?? 0.15, -1, 1);
    const layers = Math.max(1, Math.round(p.layers ?? 3));
    const color = p.color ?? '#f2f7ff';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const per = Math.ceil(n / layers);

    for (let l = 0; l < layers; l++) {
      const depth = (l + 1) / layers;          // 1 = 앞(큰·빠른·진한)
      const cyc = l + 1;                        // 정수 바퀴 → 루프
      ctx.fillStyle = withAlpha(color, op * (0.35 + 0.65 * depth));
      for (let i = 0; i < per; i++) {
        const bx = rng(), by = rng(), rs = rng(), ph = rng();
        const t = frac(by + progress * cyc);
        const y = t * (h + size * 2) - size;
        const x = bx * w + Math.sin(progress * TAU * cyc + ph * TAU) * sway * w * 0.06
          + wind * w * 0.25 * t;
        const r = size * (0.4 + 0.6 * rs) * depth;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
  },
};
