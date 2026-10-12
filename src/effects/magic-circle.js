// 마법진 — 회전하는 동심 원·다각형·룬 표식. 결정론·루프(정수 바퀴 회전). 시드 무관.
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'magic-circle',
  name: '마법진',
  category: '판타지',
  description: '회전하는 마법진',
  thumbnail: { frame: 6, bg: '#0a0618' },
  bleed: 12,
  params: [
    { key: 'rings', label: '링 수', type: 'int', default: 3, min: 1, max: 6 },
    { key: 'sides', label: '다각형 변', type: 'int', default: 6, min: 3, max: 12 },
    { key: 'marks', label: '룬 표식', type: 'int', default: 12, min: 0, max: 48 },
    { key: 'speed', label: '회전 속도', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#b98cff' },
    { key: 'color2', label: '색 2', type: 'color', default: '#f0d6ff' },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '크기', type: 'float', default: 0.4, min: 0.05, max: 0.95, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'arcane', label: '비전', values: { color: '#b98cff', color2: '#f0d6ff', sides: 6 } },
    { id: 'holy', label: '신성', values: { color: '#ffd77a', color2: '#fff6d8', sides: 8 } },
    { id: 'blood', label: '피', values: { color: '#ff5a6a', color2: '#ffd0d0', sides: 5 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const rings = Math.max(1, Math.round(p.rings ?? 3));
    const sides = Math.max(3, Math.round(p.sides ?? 6));
    const marks = Math.max(0, Math.round(p.marks ?? 12));
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const color = p.color ?? '#b98cff';
    const color2 = p.color2 ?? '#f0d6ff';
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const R = clamp(p.size ?? 0.4, 0.05, 0.95) * Math.min(w, h) * 0.5;
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const rot = progress * TAU * speed;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 동심 원
    ctx.strokeStyle = withAlpha(color, op);
    ctx.lineWidth = Math.max(1, R * 0.015);
    for (let r = 0; r < rings; r++) {
      const rr = R * (1 - r / (rings + 0.3));
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    }

    // 회전 다각형 2개(서로 반대로)
    const drawPoly = (rr, phase) => {
      ctx.beginPath();
      for (let k = 0; k <= sides; k++) {
        const a = phase + (k / sides) * TAU;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = withAlpha(color2, op);
    drawPoly(R * 0.78, rot);
    drawPoly(R * 0.78, -rot + Math.PI / sides);

    // 룬 표식(짧은 선) — 바깥 띠에 회전 배치
    if (marks > 0) {
      ctx.lineWidth = Math.max(1, R * 0.02);
      for (let k = 0; k < marks; k++) {
        const a = -rot + (k / marks) * TAU;
        const r0 = R * 0.86, r1 = R * (k % 2 === 0 ? 0.96 : 0.92);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
    }

    // 중심 점
    ctx.fillStyle = withAlpha(color2, op);
    ctx.beginPath(); ctx.arc(0, 0, Math.max(1.5, R * 0.03), 0, TAU); ctx.fill();
    ctx.restore();
  },
};
