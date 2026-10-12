// 만화 플래시 — 교차하는 방사형 쐐기 배경. 결정론·루프(정수 회전·맥동). 시드 무관. (분류: 연출)
import { TAU, withAlpha, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'comic-flash',
  name: '만화 플래시',
  category: '연출',
  description: '쾅 하고 터지는 방사형 쐐기 배경',
  thumbnail: { frame: 3, bg: '#101010' },
  bleed: 0,
  params: [
    { key: 'spokes', label: '쐐기 수', type: 'int', default: 16, min: 4, max: 48 },
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'hole', label: '가운데 빈 원', type: 'float', default: 0, min: 0, max: 0.6, step: 0.01 },
    { key: 'speed', label: '회전', type: 'int', default: 0, min: 0, max: 6 },
    { key: 'pulse', label: '맥동', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'color', label: '쐐기 색', type: 'color', default: '#ffffff' },
    { key: 'color2', label: '바탕 색', type: 'color', default: '#ffd23a' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'impact', label: '임팩트', values: { color: '#ffffff', color2: '#ffd23a' } },
    { id: 'shock', label: '충격', values: { color: '#101010', color2: '#ffffff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const spokes = Math.max(4, Math.round(p.spokes ?? 16));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const hole = clamp(p.hole ?? 0, 0, 0.6);
    const speed = Math.max(0, Math.round(p.speed ?? 0));
    const pulse = Math.max(0, Math.round(p.pulse ?? 2));
    const color = parseColor(p.color ?? '#ffffff');
    const bg = p.color2 ?? '#ffd23a';
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const diag = Math.hypot(w, h);
    const rot = progress * TAU * speed;
    const pz = pulse === 0 ? 1 : 0.85 + 0.15 * Math.sin(progress * TAU * pulse);
    const holeR = hole * diag * 0.5;

    // 바탕
    ctx.fillStyle = withAlpha(bg, op);
    ctx.fillRect(0, 0, w, h);
    // 쐐기(한 칸 걸러 색 채움)
    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${op})`;
    const R = diag * pz;
    for (let k = 0; k < spokes; k++) {
      const a0 = rot + (k / spokes) * TAU;
      const a1 = rot + ((k + 0.5) / spokes) * TAU;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.arc(cx, cy, holeR, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
    // 가운데 빈 원(바탕색으로 다시 덮음 — 내부 틈 메움)
    if (holeR > 0.5) {
      ctx.fillStyle = withAlpha(bg, op);
      ctx.beginPath(); ctx.arc(cx, cy, holeR, 0, TAU); ctx.fill();
    }
  },
};
