// HUD 링 — 회전하는 원형 표시 링. 결정론·루프(정수 바퀴 회전).
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'hud-ring',
  name: 'HUD 링',
  category: '사이버',
  description: '눈금이 있는 회전 HUD 링',
  thumbnail: { frame: 6, bg: '#040a0e' },
  bleed: 10,
  params: [
    { key: 'rings', label: '링 수', type: 'int', default: 3, min: 1, max: 6 },
    { key: 'ticks', label: '눈금', type: 'int', default: 24, min: 0, max: 72 },
    { key: 'speed', label: '회전 속도', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#39e0ff' },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '크기', type: 'float', default: 0.35, min: 0.05, max: 0.9, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const rings = Math.max(1, Math.round(p.rings ?? 3));
    const ticks = Math.max(0, Math.round(p.ticks ?? 24));
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const color = p.color ?? '#39e0ff';
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const R = clamp(p.size ?? 0.35, 0.05, 0.9) * Math.min(w, h) * 0.5;
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = withAlpha(color, op);
    ctx.fillStyle = withAlpha(color, op);
    ctx.lineCap = 'round';
    for (let r = 0; r < rings; r++) {
      const rr = R * (1 - r / (rings + 0.5));
      const dir = r % 2 === 0 ? 1 : -1;
      const rot = progress * TAU * speed * dir;
      ctx.lineWidth = 1.4;
      // 링(점선 호 2개)
      ctx.beginPath(); ctx.arc(0, 0, rr, rot, rot + Math.PI * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr, rot + Math.PI, rot + Math.PI * 1.7); ctx.stroke();
      // 눈금
      if (ticks > 0) {
        const tn = Math.max(1, Math.round(ticks / (r + 1)));
        for (let k = 0; k < tn; k++) {
          const a = rot + (k / tn) * TAU;
          const t0 = rr - 5, t1 = rr - (k % 4 === 0 ? 12 : 7);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * t0, Math.sin(a) * t0);
          ctx.lineTo(Math.cos(a) * t1, Math.sin(a) * t1);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  },
};
