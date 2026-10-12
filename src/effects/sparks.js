// 불티 — 불티가 위로 날아오르며 사그라듦(뜨거움→식음). 결정론·루프(frac 상승).
import { TAU, frac, mix, rgba, clamp } from './_fx-util.js';

export default {
  id: 'sparks',
  name: '불티',
  category: '파티클',
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
  ],
  presets: [
    { id: 'ember', label: '잉걸불', values: { color: '#ffd27a', color2: '#ff3a14' } },
    { id: 'magic', label: '마법 불꽃', values: { color: '#bfe0ff', color2: '#6a3cff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
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
