// 네온 격자 — 빛나는 원근 격자 바닥. 결정론·루프(frac 스크롤).
import { withAlpha, parseColor, rgba, frac, clamp } from './_fx-util.js';

export default {
  id: 'neon-grid',
  name: '네온 격자',
  category: '사이버',
  description: '원근으로 흐르는 네온 격자 바닥',
  thumbnail: { frame: 6, bg: '#07040f' },
  bleed: 10,
  params: [
    { key: 'horizon', label: '원근 각도', type: 'float', default: 0.5, min: 0.2, max: 0.8, step: 0.01 },
    { key: 'spacing', label: '간격', type: 'int', default: 12, min: 4, max: 30 },
    { key: 'speed', label: '흐름 속도', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#ff2d9b' },
    { key: 'horizonGlow', label: '지평선 빛', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'synth', label: '신스웨이브', values: { color: '#ff2d9b' } },
    { id: 'cyber', label: '사이버', values: { color: '#2df5ff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const horizonY = clamp(p.horizon ?? 0.5, 0.2, 0.8) * h;
    const spacing = Math.max(4, Math.round(p.spacing ?? 12));
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const color = p.color ?? '#ff2d9b';
    const glow = clamp(p.horizonGlow ?? 0.6, 0, 1);
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const c = parseColor(color);
    const progress = f / Math.max(1, frameCount);
    const scroll = speed > 0 ? frac(progress * speed) : 0;
    const vpx = w / 2;

    // 지평선 빛
    if (glow > 0) {
      const g = ctx.createLinearGradient(0, horizonY - h * 0.15, 0, horizonY + h * 0.08);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(0.7, rgba(c, glow * 0.5));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, horizonY - h * 0.15, w, h * 0.23);
    }

    ctx.save();
    ctx.strokeStyle = withAlpha(color, op);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    // 가로선(원근: 아래로 갈수록 간격 넓어짐, 스크롤)
    const N = spacing;
    for (let i = 0; i <= N; i++) {
      const t = (i + scroll) / N;
      const y = horizonY + (h - horizonY) * (t * t);
      if (y < horizonY || y > h + 2) continue;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    // 세로선(소실점으로 수렴)
    const cols = spacing;
    for (let i = -cols; i <= cols; i++) {
      const xBottom = vpx + (i / cols) * w * 1.4;
      ctx.moveTo(vpx, horizonY); ctx.lineTo(xBottom, h);
    }
    ctx.stroke();
    ctx.restore();
  },
};
