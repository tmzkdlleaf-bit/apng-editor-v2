// 요정 가루 — 소용돌이치며 반짝이는 마법 가루. 결정론·루프(정수 회전·명멸). 시드 의존.
import { TAU, mix, clamp } from './_fx-util.js';

export default {
  id: 'fairy-dust',
  name: '요정 가루',
  category: '판타지',
  description: '소용돌이치며 반짝이는 마법 가루',
  thumbnail: { frame: 8, bg: '#0a0618' },
  bleed: 16,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 120, min: 10, max: 500 },
    { key: 'size', label: '크기', type: 'float', default: 3, min: 1, max: 10, step: 0.5 },
    { key: 'speed', label: '회전 속도', type: 'int', default: 1, min: 0, max: 5 },
    { key: 'color', label: '색', type: 'color', default: '#fff1b0' },
    { key: 'color2', label: '색 2', type: 'color', default: '#ffb0e6' },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'radius', label: '퍼짐', type: 'float', default: 0.4, min: 0.05, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(10, Math.round(p.count ?? 120));
    const size = p.size ?? 3;
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const spread = clamp(p.radius ?? 0.4, 0.05, 1) * Math.min(w, h) * 0.5;
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const ang0 = rng() * TAU;
      const rad = (0.1 + 0.9 * rng()) * spread;
      const turns = 1 + Math.floor(rng() * 2);
      const dir = rng() < 0.5 ? 1 : -1;
      const twk = rng() * TAU;
      const cmix = rng();
      const szv = rng();
      const ang = ang0 + progress * TAU * turns * speed * dir;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      const tw = 0.3 + 0.7 * Math.max(0, Math.sin(progress * TAU * 3 + twk));
      const col = mix(p.color ?? '#fff1b0', p.color2 ?? '#ffb0e6', cmix);
      const r = Math.max(0.4, size * (0.5 + szv * 0.8) * (0.5 + 0.5 * tw));
      ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${op * tw})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
