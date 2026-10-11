// 연기 — 피어오르는 연기. 결정론·루프(frac 상승).
import { TAU, frac, parseColor, rgba, clamp } from './_fx-util.js';

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
  ],
  presets: [
    { id: 'gray', label: '회색 연기', values: { color: '#b9bcc6' } },
    { id: 'dark', label: '검은 연기', values: { color: '#5a5a62', opacity: 0.7 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
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
