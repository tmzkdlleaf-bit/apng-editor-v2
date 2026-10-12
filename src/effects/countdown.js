// 카운트다운 — 숫자가 줄며 고리가 휩쓴다. 결정론·루프(frac 순환). 시드 무관. (분류: 연출)
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'countdown',
  name: '카운트다운',
  category: '연출',
  description: '숫자가 줄며 고리가 휩쓴다',
  thumbnail: { frame: 2, bg: '#101010' },
  bleed: 6,
  params: [
    { key: 'from', label: '시작 숫자', type: 'int', default: 3, min: 1, max: 9 },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '크기', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    { key: 'color', label: '숫자 색', type: 'color', default: '#ffffff' },
    { key: 'ringColor', label: '고리 색', type: 'color', default: '#ff5a6a' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const from = Math.max(1, Math.round(p.from ?? 3));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const R = clamp(p.size ?? 0.5, 0.1, 1) * Math.min(w, h) * 0.5;
    const color = p.color ?? '#ffffff';
    const ringColor = p.ringColor ?? '#ff5a6a';
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const t = ((progress % 1) + 1) % 1;       // 0..1
    const step = Math.floor(t * from);         // 0..from-1
    const num = from - step;                   // from..1
    const local = t * from - step;             // 현 숫자 구간 0..1
    const pop = local < 0.2 ? local / 0.2 : 1; // 나타날 때 커짐
    const fade = local > 0.75 ? 1 - (local - 0.75) / 0.25 : 1; // 사라질 때 흐려짐
    const sc = 0.7 + 0.3 * pop;

    ctx.save();
    ctx.translate(cx, cy);

    // 고리: 현 숫자 구간을 한 바퀴 휩쓸기
    ctx.strokeStyle = withAlpha(ringColor, op * fade);
    ctx.lineWidth = Math.max(2, R * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + TAU * local);
    ctx.stroke();

    // 숫자
    ctx.fillStyle = withAlpha(color, op * fade);
    ctx.font = `bold ${Math.max(4, Math.round(R * 1.2 * sc))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 0, R * 0.05);
    ctx.restore();
  },
};
