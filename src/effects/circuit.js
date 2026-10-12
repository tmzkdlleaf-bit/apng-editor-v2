// 회로 — 전자회로 패턴과 흐르는 빛. 결정론·루프(frac 흐름).
import { TAU, withAlpha, hash2, frac, clamp } from './_fx-util.js';

export default {
  id: 'circuit',
  name: '회로',
  category: '사이버',
  description: '전자회로 패턴 위로 빛이 흐른다',
  thumbnail: { frame: 6, bg: '#050a0e' },
  bleed: 6,
  params: [
    { key: 'density', label: '밀도', type: 'float', default: 0.6, min: 0.1, max: 1, step: 0.01 },
    { key: 'speed', label: '빛 흐름 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#2fe0c0' },
    { key: 'color2', label: '색 2', type: 'color', default: '#1b6b7a' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const density = clamp(p.density ?? 0.6, 0.1, 1);
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const color = p.color ?? '#2fe0c0';
    const color2 = p.color2 ?? '#1b6b7a';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const seed = Math.floor(rng() * 100000);
    const progress = f / Math.max(1, frameCount);

    const cell = Math.round(60 - density * 36); // 24~57
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;

    // 바탕 트레이스(어두운 선 + 노드)
    ctx.strokeStyle = withAlpha(color2, op);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    const segs = []; // 흐르는 빛을 올릴 가로 트레이스
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x = gx * cell, y = gy * cell;
        if (hash2(gx, gy, seed) < 0.55) { // 가로 트레이스
          const len = (1 + Math.floor(hash2(gx, gy, seed + 1) * 2)) * cell;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
          segs.push({ x, y, len });
        }
        if (hash2(gx, gy, seed + 2) < 0.4) { // 세로 트레이스
          const len = (1 + Math.floor(hash2(gx, gy, seed + 3) * 2)) * cell;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
        }
        if (hash2(gx, gy, seed + 4) < 0.5) { // 노드
          ctx.fillStyle = withAlpha(color2, op);
          ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
        }
      }
    }

    // 흐르는 빛(가로 트레이스 위 밝은 점)
    ctx.fillStyle = withAlpha(color, op);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (hash2(i, 7, seed) > density) continue;
      const t = frac(hash2(i, 9, seed) + progress * speed);
      const px = s.x + t * s.len;
      const g = ctx.createRadialGradient(px, s.y, 0, px, s.y, 5);
      g.addColorStop(0, withAlpha(color, op));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, s.y, 5, 0, TAU); ctx.fill();
    }
  },
};
