// 무대 조명 — 빛줄기가 좌우로 쓸고 지나감 + 바닥 빛 웅덩이. 결정론·루프(sweep sin).
import { TAU, withAlpha, parseColor, rgba, clamp } from './_fx-util.js';

export default {
  id: 'stage-lights',
  name: '무대 조명',
  category: '빛',
  description: '빛줄기가 좌우로 쓸고 지나가는 무대 조명',
  thumbnail: { frame: 3, bg: '#07060a' },
  bleed: 20,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 3, min: 1, max: 10 },
    { key: 'angleRange', label: '각도 범위', type: 'float', default: 35, min: 0, max: 80, step: 1 },
    { key: 'sweeps', label: '쓸기 횟수', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#9ec9ff' },
    { key: 'floorPool', label: '바닥 빛 웅덩이', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'concert', label: '공연', values: { count: 4, color: '#b98cff' } },
    { id: 'warm', label: '따뜻한', values: { color: '#ffd27a' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(1, Math.round(p.count ?? 3));
    const range = (p.angleRange ?? 35) * Math.PI / 180;
    const sweeps = Math.max(1, Math.round(p.sweeps ?? 1));
    const color = p.color ?? '#9ec9ff';
    const floor = clamp(p.floorPool ?? 0.5, 0, 1);
    const op = clamp(p.opacity ?? 0.6, 0, 1);
    const col = parseColor(color);
    const progress = f / Math.max(1, frameCount);
    const beamW = Math.max(w, h) * 0.12;
    const len = Math.hypot(w, h) * 1.2;

    for (let i = 0; i < count; i++) {
      const bx = (i + 0.5) / count * w;
      const ph = rng() * TAU;
      const dir = (rng() < 0.5 ? 1 : -1);
      const ang = Math.sin(progress * TAU * sweeps + ph) * range * dir; // 좌우 쓸기(루프)
      ctx.save();
      ctx.translate(bx, -h * 0.05);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, withAlpha(color, op));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-beamW * 0.3, 0);
      ctx.lineTo(beamW * 0.3, 0);
      ctx.lineTo(beamW, len);
      ctx.lineTo(-beamW, len);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 바닥 빛 웅덩이(납작한 타원)
      if (floor > 0) {
        const fx = bx + Math.sin(progress * TAU * sweeps + ph) * dir * w * 0.3;
        const fy = h * 0.92;
        const fr = beamW * 1.2;
        const gg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
        gg.addColorStop(0, rgba(col, op * floor));
        gg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.ellipse(fx, fy, fr, fr * 0.35, 0, 0, TAU); ctx.fill();
      }
    }
  },
};
