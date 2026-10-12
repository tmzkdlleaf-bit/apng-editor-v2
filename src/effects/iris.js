// 아이리스 — 원형 차폐가 중심으로 닫혔다 열린다. 결정론·루프(cos 왕복). 시드 무관. (분류: 연출)
import { TAU, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'iris',
  name: '아이리스',
  category: '연출',
  description: '원형 차폐가 중심으로 닫혔다 열린다',
  thumbnail: { frame: 12, bg: '#303030' },
  bleed: 0,
  params: [
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'color', label: '색', type: 'color', default: '#000000' },
    { key: 'softness', label: '가장자리 부드러움', type: 'float', default: 0.08, min: 0, max: 0.5, step: 0.01 },
    { key: 'invert', label: '반대로(가운데만 가림)', type: 'bool', default: false },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const color = parseColor(p.color ?? '#000000');
    const soft = clamp(p.softness ?? 0.08, 0, 0.5);
    const invert = p.invert ?? false;
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    // 열림(가림 없음) → 닫힘(중심) → 열림
    const maxR = Math.hypot(w, h) * 0.6;
    const holeR = maxR * (0.5 + 0.5 * Math.cos(progress * TAU));
    const edge = Math.max(1, soft * maxR);

    ctx.save();
    if (!invert) {
      // 바깥을 가림: 전체 채우고 가운데 구멍을 파낸다
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${op})`;
      ctx.fillRect(-8, -8, w + 16, h + 16);
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, holeR - edge), cx, cy, holeR + edge);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, holeR + edge, 0, TAU); ctx.fill();
    } else {
      // 가운데만 가림: 반지름 holeR 의 원판
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, holeR - edge), cx, cy, holeR + edge);
      g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${op})`);
      g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, holeR + edge, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
};
