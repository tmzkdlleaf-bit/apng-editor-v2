// 오라 — 중심에서 번지는 맥동 글로우와 퍼지는 파문. 결정론·루프(정수 맥동). 시드 무관.
import { TAU, rgba, mix, clamp } from './_fx-util.js';

export default {
  id: 'aura',
  name: '오라',
  category: '판타지',
  description: '중심에서 번지는 맥동하는 오라',
  thumbnail: { frame: 6, bg: '#0a0618' },
  bleed: 30,
  params: [
    { key: 'size', label: '크기', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    { key: 'pulses', label: '맥동 수', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'rings', label: '파문 수', type: 'int', default: 3, min: 0, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#9b7bff' },
    { key: 'color2', label: '색 2', type: 'color', default: '#ff7bd0' },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'intensity', label: '세기', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'arcane', label: '비전', values: { color: '#9b7bff', color2: '#ff7bd0' } },
    { id: 'rage', label: '분노', values: { color: '#ff5a3c', color2: '#ffd23a' } },
    { id: 'heal', label: '치유', values: { color: '#49d16a', color2: '#d8ffd8' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const size = clamp(p.size ?? 0.5, 0.1, 1);
    const pulses = Math.max(0, Math.round(p.pulses ?? 2));
    const rings = Math.max(0, Math.round(p.rings ?? 3));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const intensity = clamp(p.intensity ?? 0.8, 0, 1);
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const maxR = size * Math.hypot(w, h) * 0.5;
    const progress = f / Math.max(1, frameCount);
    const col = mix(p.color ?? '#9b7bff', p.color2 ?? '#ff7bd0', 0.5);

    // 바탕 글로우(맥동)
    const pulse = pulses === 0 ? 0.5 : 0.5 + 0.5 * Math.sin(progress * TAU * pulses);
    const baseR = maxR * (0.7 + 0.3 * pulse);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
    g.addColorStop(0, rgba(col, op * intensity * (0.5 + 0.5 * pulse)));
    g.addColorStop(0.5, rgba(col, op * intensity * 0.3));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, baseR, 0, TAU); ctx.fill();

    // 퍼져 나가는 파문 링
    if (rings > 0) {
      ctx.lineWidth = Math.max(1, maxR * 0.02);
      for (let r = 0; r < rings; r++) {
        const t = ((progress + r / rings) % 1 + 1) % 1;
        const rr = t * maxR;
        if (rr <= 0.5) continue;
        ctx.strokeStyle = rgba(col, op * (1 - t) * 0.6);
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      }
    }
  },
};
