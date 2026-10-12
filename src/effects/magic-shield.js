// 마법 보호막 — 육각 격자가 일렁이는 방어막 돔. 결정론·루프(정수 일렁임). 시드 무관.
import { TAU, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'magic-shield',
  name: '마법 보호막',
  category: '판타지',
  description: '육각 격자가 일렁이는 방어막',
  thumbnail: { frame: 6, bg: '#060a16' },
  bleed: 16,
  params: [
    { key: 'size', label: '크기', type: 'float', default: 0.45, min: 0.1, max: 0.95, step: 0.01 },
    { key: 'cells', label: '격자 촘촘함', type: 'int', default: 5, min: 2, max: 14 },
    { key: 'speed', label: '일렁임 속도', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#5ad1ff' },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'intensity', label: '세기', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'blue', label: '청색막', values: { color: '#5ad1ff' } },
    { id: 'holy', label: '신성막', values: { color: '#ffe07a' } },
    { id: 'toxic', label: '독막', values: { color: '#7dff5a' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const R = clamp(p.size ?? 0.45, 0.1, 0.95) * Math.min(w, h) * 0.5;
    const cells = Math.max(2, Math.round(p.cells ?? 5));
    const speed = Math.max(0, Math.round(p.speed ?? 2));
    const c = parseColor(p.color ?? '#5ad1ff');
    const intensity = clamp(p.intensity ?? 0.7, 0, 1);
    const op = clamp(p.opacity ?? 0.8, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.save();
    // 돔 글로우(가장자리로 갈수록 진함)
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0)`);
    g.addColorStop(0.75, `rgba(${c.r},${c.g},${c.b},${op * intensity * 0.25})`);
    g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},${op * intensity * 0.5})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    // 육각 격자 — 원 안으로 클립
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    const hr = R / cells;               // 육각 반지름
    const dx = hr * 1.5, dy = hr * Math.sqrt(3);
    ctx.lineWidth = Math.max(1, hr * 0.08);
    const span = cells + 2;
    for (let col = -span; col <= span; col++) {
      for (let row = -span; row <= span; row++) {
        const hx = cx + col * dx;
        const hy = cy + row * dy + (col % 2 ? dy / 2 : 0);
        const d = Math.hypot(hx - cx, hy - cy) / R;
        const shimmer = speed === 0 ? 0.5 : 0.5 + 0.5 * Math.sin(progress * TAU * speed - d * 4);
        const a = op * (0.15 + 0.5 * shimmer * intensity);
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${a})`;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const ang = (k / 6) * TAU;
          const x = hx + Math.cos(ang) * hr * 0.92;
          const y = hy + Math.sin(ang) * hr * 0.92;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};
