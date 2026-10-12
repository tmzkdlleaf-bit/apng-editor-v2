// 홀로그램 — 무지개빛 홀로그램 막·줄. 소스 모양 안에만. 결정론·루프.
import { TAU, withAlpha, frac, clamp } from './_fx-util.js';

export default {
  id: 'hologram',
  name: '홀로그램',
  category: '사이버',
  description: '소스 모양을 채우는 무지개빛 홀로그램 막',
  thumbnail: { frame: 4, bg: '#060a12' },
  bleed: 10,
  params: [
    { key: 'hue', label: '기준 색', type: 'float', default: 180, min: 0, max: 360, step: 1 },
    { key: 'range', label: '색 범위', type: 'float', default: 160, min: 0, max: 360, step: 1 },
    { key: 'lineSpacing', label: '줄 간격', type: 'float', default: 4, min: 2, max: 20, step: 0.5 },
    { key: 'flow', label: '흐름', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'flicker', label: '깜빡임', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full'],
  sources: [{ key: 'shape', label: '모양' }],
  render(ctx, { f, frameCount, w, h, sources, pad = 0 }, p) {
    const src = (sources || []).find((s) => s.key === 'shape')?.canvas;
    if (!src) return;
    const hue0 = p.hue ?? 180, range = p.range ?? 160;
    const spacing = Math.max(2, p.lineSpacing ?? 4);
    const flow = Math.max(0, Math.round(p.flow ?? 1));
    const flicker = Math.max(0, Math.round(p.flicker ?? 2));
    const op = clamp(p.opacity ?? 0.8, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const drift = frac(progress * flow);
    const flick = flicker > 0 ? (0.75 + 0.25 * Math.sin(progress * TAU * flicker)) : 1;

    // 무지개 세로 그라디언트(흐름에 따라 색 이동)
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (let k = 0; k <= 6; k++) {
      const hue = (hue0 + range * ((k / 6 + drift) % 1)) % 360;
      g.addColorStop(k / 6, `hsl(${hue},85%,60%)`);
    }
    ctx.globalAlpha = op * flick;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 가로 주사선(어둡게)
    ctx.globalAlpha = op * flick * 0.5;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < h; y += spacing) ctx.fillRect(0, y, w, Math.max(1, spacing * 0.4));
    ctx.globalAlpha = 1;

    // 소스 모양 안으로 제한
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(src, pad, pad);
    ctx.restore();
  },
};
