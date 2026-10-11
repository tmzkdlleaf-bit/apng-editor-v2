// 보케 — 흐릿한 빛망울이 떠다님. 결정론·루프(frac 흐름).
import { TAU, withAlpha, frac, lerp, mix, rgba, clamp } from './_fx-util.js';

export default {
  id: 'bokeh',
  name: '보케',
  category: '빛',
  description: '흐릿한 빛망울이 천천히 떠다닌다',
  thumbnail: { frame: 8, bg: '#0a0f1a' },
  bleed: 30,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 24, min: 1, max: 200 },
    { key: 'size', label: '크기', type: 'float', default: 36, min: 6, max: 120, step: 1 },
    { key: 'variance', label: '크기 편차', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'speed', label: '움직임', type: 'int', default: 1, min: 0, max: 5 },
    { key: 'color', label: '색', type: 'color', default: '#ffd9a0' },
    { key: 'color2', label: '색 2', type: 'color', default: '#a0c8ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(1, Math.round(p.count ?? 24));
    const size = p.size ?? 36;
    const variance = clamp(p.variance ?? 0.6, 0, 1);
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const op = clamp(p.opacity ?? 0.6, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < count; i++) {
      const bx = rng(), by = rng(), rs = rng(), ct = rng(), drift = rng();
      const r = size * (1 - variance + variance * (0.3 + rs));
      // 느리게 위로 떠오르며 가로로 흔들림(정수 바퀴 → 루프 이음매 유지)
      const y = frac(by - progress * speed) * (h + size * 2) - size;
      const x = bx * w + Math.sin(progress * TAU * Math.max(1, speed) + drift * TAU) * size * 0.4;
      const col = mix(p.color ?? '#ffd9a0', p.color2 ?? '#a0c8ff', ct);
      const a = op * (0.35 + 0.65 * rs);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(0.7, rgba(col, a * 0.5));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  },
};
