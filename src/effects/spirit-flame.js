// 도깨비불 — 허공을 떠도는 혼불. 결정론·루프(정수 궤도). 시드 의존.
import { TAU, rgba, parseColor, clamp } from './_fx-util.js';

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
  ],
  presets: [
    { id: 'blue', label: '푸른 혼불', values: { color: '#dff6ff', color2: '#4aa6ff' } },
    { id: 'green', label: '귀화', values: { color: '#e6ffe6', color2: '#49d16a' } },
    { id: 'purple', label: '망령', values: { color: '#f3e6ff', color2: '#9a5cff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
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
