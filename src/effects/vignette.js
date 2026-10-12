// 비네트 — 가장자리 어둡게. 정적(루프 자명). 결정론.
import { TAU, withAlpha, parseColor, rgba, clamp } from './_fx-util.js';

export default {
  id: 'vignette',
  name: '비네트',
  category: '오버레이',
  description: '가장자리를 어둡게 눌러 시선을 모은다',
  thumbnail: { frame: 0, bg: '#1a1f2c' },
  bleed: 0,
  params: [
    { key: 'intensity', label: '세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'size', label: '크기', type: 'float', default: 0.7, min: 0.2, max: 1.2, step: 0.01 },
    { key: 'softness', label: '부드러움', type: 'float', default: 0.5, min: 0.05, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#000000' },
    { key: 'shape', label: '모양', type: 'select', default: 'circle',
      options: [{ value: 'circle', label: '원' }, { value: 'rect', label: '사각' }] },
  ],
  scopes: ['full', 'box'],
  render(ctx, { w, h }, p) {
    const intensity = clamp(p.intensity ?? 0.6, 0, 1);
    const size = clamp(p.size ?? 0.7, 0.2, 1.2);
    const soft = clamp(p.softness ?? 0.5, 0.05, 1);
    const color = p.color ?? '#000000';
    const cx = w / 2, cy = h / 2;

    if (p.shape === 'rect') {
      // 네 변에서 안쪽으로 어두워지는 선형 그라디언트 4개(모서리는 겹쳐 더 진함).
      const band = Math.min(w, h) * 0.5 * size * (0.5 + soft);
      const edge = (x, y, ww, hh, gx0, gy0, gx1, gy1) => {
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, withAlpha(color, intensity));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y, ww, hh);
      };
      edge(0, 0, band, h, 0, 0, band, 0);
      edge(w - band, 0, band, h, w, 0, w - band, 0);
      edge(0, 0, w, band, 0, 0, 0, band);
      edge(0, h - band, w, band, 0, h, 0, h - band);
    } else {
      const outer = Math.hypot(w, h) / 2 * (0.6 + size * 0.6);
      const inner = outer * (1 - soft);
      const c = parseColor(color);
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, inner), cx, cy, outer);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(1, rgba(c, intensity));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
