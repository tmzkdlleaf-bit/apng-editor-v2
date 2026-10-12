// 에너지 구체 — 중심을 도는 마력 구체와 꼬리. 결정론·루프(정수 궤도). 시드 무관.
import { TAU, rgba, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'energy-orb',
  name: '에너지 구체',
  category: '판타지',
  description: '중심을 도는 마력 구체',
  thumbnail: { frame: 8, bg: '#060616' },
  bleed: 24,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 5, min: 1, max: 24 },
    { key: 'size', label: '크기', type: 'float', default: 14, min: 4, max: 50, step: 1 },
    { key: 'speed', label: '회전 속도', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '속 색', type: 'color', default: '#eafaff' },
    { key: 'color2', label: '겉 색', type: 'color', default: '#5ad1ff' },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'radius', label: '궤도 반지름', type: 'float', default: 0.3, min: 0.02, max: 0.9, step: 0.01 },
    { key: 'trail', label: '꼬리', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const count = Math.max(1, Math.round(p.count ?? 5));
    const size = p.size ?? 14;
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const inner = parseColor(p.color ?? '#eafaff');
    const outer = parseColor(p.color2 ?? '#5ad1ff');
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const orbit = clamp(p.radius ?? 0.3, 0.02, 0.9) * Math.min(w, h) * 0.5;
    const trail = clamp(p.trail ?? 0.6, 0, 1);
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.globalCompositeOperation = 'lighter';
    const TN = trail > 0 ? 6 : 1;
    for (let i = 0; i < count; i++) {
      const base = (i / count) * TAU;
      for (let t = 0; t < TN; t++) {
        const ang = base + (progress - t * 0.05 * trail) * TAU * speed;
        const x = cx + Math.cos(ang) * orbit;
        const y = cy + Math.sin(ang) * orbit;
        const fade = 1 - t / TN;
        const r = Math.max(0.5, size * (t === 0 ? 1 : 0.7) * fade);
        const a = op * fade * (t === 0 ? 1 : 0.5);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(inner, a));
        g.addColorStop(0.4, rgba(outer, a * 0.8));
        g.addColorStop(1, rgba(outer, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
