// 방울 — 투명한 방울이 올라감(반사 하이라이트). 결정론·루프(frac 상승).
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'bubbles',
  name: '방울',
  category: '파티클',
  description: '투명한 방울이 흔들리며 올라간다',
  thumbnail: { frame: 8, bg: '#07121a' },
  bleed: 6,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 30, min: 1, max: 200 },
    { key: 'size', label: '크기', type: 'float', default: 16, min: 4, max: 60, step: 1 },
    { key: 'variance', label: '크기 편차', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'wobble', label: '흔들림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'speed', label: '상승 속도', type: 'int', default: 1, min: 1, max: 5 },
    { key: 'highlight', label: '반사 하이라이트', type: 'bool', default: true },
    { key: 'color', label: '색', type: 'color', default: '#bfe8ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 30));
    const size = p.size ?? 16;
    const variance = clamp(p.variance ?? 0.6, 0, 1);
    const wobble = clamp(p.wobble ?? 0.5, 0, 1);
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const highlight = p.highlight ?? true;
    const color = p.color ?? '#bfe8ff';
    const op = clamp(p.opacity ?? 0.7, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng();
      const r = size * (1 - variance + variance * (0.3 + rs));
      const t = frac(by - progress * speed);
      const y = t * (h + size * 2) - size;
      const x = bx * w + Math.sin(progress * TAU * speed + ph * TAU) * wobble * w * 0.05;
      // 테두리 링 + 옅은 속
      ctx.strokeStyle = withAlpha(color, op);
      ctx.lineWidth = Math.max(0.8, r * 0.08);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = withAlpha(color, op * 0.12);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (highlight) {
        ctx.fillStyle = withAlpha('#ffffff', op * 0.8);
        ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, TAU); ctx.fill();
      }
    }
  },
};
