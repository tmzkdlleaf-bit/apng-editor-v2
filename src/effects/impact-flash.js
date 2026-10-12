// 임팩트 플래시 — 화면 전체가 번쩍인다. 결정론·루프(정수 번쩍임). 시드 무관. (분류: 연출)
import { parseColor, clamp } from './_fx-util.js';

export default {
  id: 'impact-flash',
  name: '임팩트 플래시',
  category: '연출',
  description: '화면 전체가 번쩍인다',
  thumbnail: { frame: 1, bg: '#101010' },
  bleed: 0,
  params: [
    { key: 'flashes', label: '번쩍임 수', type: 'int', default: 2, min: 1, max: 10 },
    { key: 'sharpness', label: '날카로움', type: 'float', default: 4, min: 1, max: 12, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'edge', label: '가장자리만', type: 'bool', default: false },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const flashes = Math.max(1, Math.round(p.flashes ?? 2));
    const sharp = clamp(p.sharpness ?? 4, 1, 12);
    const color = parseColor(p.color ?? '#ffffff');
    const edge = p.edge ?? false;
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    // 날카로운 펄스: |sin| 의 거듭제곱. progress=0,1 모두 0 → 루프
    const s = Math.abs(Math.sin(progress * Math.PI * flashes));
    const amt = Math.pow(s, sharp) * op;
    if (amt <= 0.003) return;
    if (edge) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.5);
      g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0)`);
      g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},${amt})`);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${amt})`;
    }
    ctx.fillRect(0, 0, w, h);
  },
};
