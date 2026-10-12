// 파문 — 중심에서 퍼져 나가는 동심 물결. 결정론·루프(frac 반복). 시드 무관. (분류: 연출)
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'ripple',
  name: '파문',
  category: '연출',
  description: '중심에서 퍼져 나가는 물결',
  thumbnail: { frame: 8, bg: '#071018' },
  bleed: 8,
  params: [
    { key: 'rings', label: '물결 수', type: 'int', default: 4, min: 1, max: 12 },
    { key: 'speed', label: '퍼지는 속도', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '최대 크기', type: 'float', default: 0.9, min: 0.2, max: 1.5, step: 0.01 },
    { key: 'thickness', label: '두께', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#9fe4ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const rings = Math.max(1, Math.round(p.rings ?? 4));
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const maxR = clamp(p.size ?? 0.9, 0.2, 1.5) * Math.min(w, h) * 0.5;
    const thick = p.thickness ?? 3;
    const color = p.color ?? '#9fe4ff';
    const op = clamp(p.opacity ?? 0.8, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let r = 0; r < rings; r++) {
      const t = ((progress * speed + r / rings) % 1 + 1) % 1;
      const rr = t * maxR;
      if (rr <= 0.5) continue;
      const a = op * (1 - t) * (t < 0.08 ? t / 0.08 : 1); // 생길 때 살짝 페이드인
      ctx.strokeStyle = withAlpha(color, a);
      ctx.lineWidth = thick * (1 - t * 0.5);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    }
  },
};
