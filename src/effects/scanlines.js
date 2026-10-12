// 주사선 — 옛날 화면 가로 줄무늬. 결정론·루프(frac 흐름).
import { withAlpha, parseColor, rgba, clamp, frac } from './_fx-util.js';

export default {
  id: 'scanlines',
  name: '주사선',
  category: '오버레이',
  description: '옛날 브라운관 같은 가로 줄무늬',
  thumbnail: { frame: 0, bg: '#0c1014' },
  bleed: 0,
  params: [
    { key: 'spacing', label: '간격', type: 'float', default: 4, min: 2, max: 20, step: 0.5 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'speed', label: '흐름 속도', type: 'int', default: 0, min: 0, max: 6 },
    { key: 'curve', label: '화면 휨', type: 'float', default: 0.3, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#000000' },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const spacing = Math.max(2, p.spacing ?? 4);
    const intensity = clamp(p.intensity ?? 0.4, 0, 1);
    const speed = Math.max(0, Math.round(p.speed ?? 0));
    const curve = clamp(p.curve ?? 0.3, 0, 1);
    const color = p.color ?? '#000000';
    const progress = f / Math.max(1, frameCount);
    const offset = speed > 0 ? frac(progress * speed) * spacing : 0;

    ctx.fillStyle = withAlpha(color, intensity);
    const lineH = Math.max(1, spacing * 0.5);
    for (let y = -spacing + offset; y < h; y += spacing) {
      ctx.fillRect(0, y, w, lineH);
    }
    // 화면 휨(가장자리 어둡게)
    if (curve > 0) {
      const c = parseColor(color);
      const outer = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(w / 2, h / 2, outer * (1 - curve * 0.6), w / 2, h / 2, outer);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(1, rgba(c, curve * 0.6));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
