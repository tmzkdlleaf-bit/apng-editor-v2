// 불꽃놀이 — 밤하늘에 터지는 불꽃. 결정론·루프(정수 횟수 수명). 시드 의존. (분류: 연출)
import { TAU, rgba, mix, clamp } from './_fx-util.js';

export default {
  id: 'fireworks',
  name: '불꽃놀이',
  category: '연출',
  description: '밤하늘에 터지는 불꽃',
  thumbnail: { frame: 9, bg: '#050514' },
  bleed: 8,
  params: [
    { key: 'shells', label: '폭죽 수', type: 'int', default: 6, min: 1, max: 24 },
    { key: 'particles', label: '파편 수', type: 'int', default: 48, min: 8, max: 160 },
    { key: 'bursts', label: '터지는 횟수', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'size', label: '퍼짐', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffd36a' },
    { key: 'color2', label: '색 2', type: 'color', default: '#ff5ab0' },
    { key: 'gravity', label: '중력', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const shells = Math.max(1, Math.round(p.shells ?? 6));
    const particles = Math.max(8, Math.round(p.particles ?? 48));
    const bursts = Math.max(1, Math.round(p.bursts ?? 2));
    const spread = clamp(p.size ?? 0.25, 0.05, 0.6) * Math.min(w, h);
    const grav = clamp(p.gravity ?? 0.4, 0, 1);
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < shells; s++) {
      const bx = 0.1 + rng() * 0.8, by = 0.15 + rng() * 0.5;
      const off = rng();
      const col = mix(p.color ?? '#ffd36a', p.color2 ?? '#ff5ab0', rng());
      const seedAng = rng() * TAU;
      const life = ((progress * bursts + off) % 1 + 1) % 1; // 수명 0..1 (bursts 번 반복 → 루프)
      const a = op * (1 - life);
      if (a <= 0.01) continue;
      const cx = bx * w, cy = by * h;
      const rad = spread * life;
      for (let i = 0; i < particles; i++) {
        const ang = seedAng + (i / particles) * TAU;
        const vr = 0.6 + ((i * 2654435761) >>> 0) % 1000 / 1000 * 0.4; // 결정론적 반경 변주
        const x = cx + Math.cos(ang) * rad * vr;
        const y = cy + Math.sin(ang) * rad * vr + grav * spread * life * life;
        const r = Math.max(0.6, 2.4 * (1 - life));
        ctx.fillStyle = rgba(col, a);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
