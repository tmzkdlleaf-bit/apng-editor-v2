// 빛 샘 — 가장자리에서 새어드는 빛. 결정론·루프(일렁임 sin).
import { TAU, withAlpha, mix, rgba, clamp } from './_fx-util.js';

const POS = {
  tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1],
  top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
};

export default {
  id: 'light-leak',
  name: '빛 샘',
  category: '빛',
  description: '가장자리에서 새어드는 빛',
  thumbnail: { frame: 6, bg: '#0a0f1a' },
  bleed: 20,
  params: [
    { key: 'position', label: '위치', type: 'select', default: 'tr',
      options: [
        { value: 'tl', label: '왼쪽 위' }, { value: 'tr', label: '오른쪽 위' },
        { value: 'bl', label: '왼쪽 아래' }, { value: 'br', label: '오른쪽 아래' },
        { value: 'top', label: '위' }, { value: 'bottom', label: '아래' },
        { value: 'left', label: '왼쪽' }, { value: 'right', label: '오른쪽' },
      ] },
    { key: 'spread', label: '퍼짐', type: 'float', default: 0.6, min: 0.1, max: 1.2, step: 0.01 },
    { key: 'shimmer', label: '일렁임', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#ff9e5e' },
    { key: 'color2', label: '색 2', type: 'color', default: '#ffe08a' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'sunset', label: '노을', values: { color: '#ff7a3c', color2: '#ffd36b' } },
    { id: 'cool', label: '차가운', values: { color: '#5e9eff', color2: '#b9e0ff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const [px, py] = POS[p.position] ?? POS.tr;
    const ox = px * w, oy = py * h;
    const spread = clamp(p.spread ?? 0.6, 0.1, 1.2) * Math.hypot(w, h);
    const shimmer = Math.max(0, Math.round(p.shimmer ?? 1));
    const op = clamp(p.opacity ?? 0.7, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const mod = shimmer > 0 ? (0.75 + 0.25 * Math.sin(progress * TAU * shimmer)) : 1;
    const r = spread * mod;
    const mid = mix(p.color ?? '#ff9e5e', p.color2 ?? '#ffe08a', 0.5);

    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    g.addColorStop(0, withAlpha(p.color2 ?? '#ffe08a', op));
    g.addColorStop(0.4, rgba(mid, op * 0.6));
    g.addColorStop(1, withAlpha(p.color ?? '#ff9e5e', 0));
    ctx.fillStyle = g;
    ctx.fillRect(ox - r, oy - r, r * 2, r * 2);
  },
};
