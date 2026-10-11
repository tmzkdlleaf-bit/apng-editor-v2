// 손전등 — 원형 빛만 보이고 나머지 어둠, 빛이 움직임. 결정론·루프(흔들림 sin).
import { TAU, clamp } from './_fx-util.js';

export default {
  id: 'flashlight',
  name: '손전등',
  category: '빛',
  description: '원형 빛만 보이고 나머지는 어둡게, 빛이 움직인다',
  thumbnail: { frame: 6, bg: '#05070a' },
  bleed: 0,
  params: [
    { key: 'pos', label: '빛 위치', type: 'coord', default: { x: 0.5, y: 0.5 }, animatable: true },
    { key: 'radius', label: '반경', type: 'float', default: 0.28, min: 0.05, max: 0.9, step: 0.01 },
    { key: 'softness', label: '가장자리 부드러움', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'darkness', label: '어둠 정도', type: 'float', default: 0.85, min: 0, max: 1, step: 0.01 },
    { key: 'wobble', label: '흔들림', type: 'int', default: 1, min: 0, max: 6 },
  ],
  scopes: ['full'], // 화면 전체를 덮는 어둠 — 박스는 의미가 적어 제외.
  sources: [],
  render(ctx, { f, frameCount, w, h }, p) {
    const pos = p.pos ?? { x: 0.5, y: 0.5 };
    const wobble = Math.max(0, Math.round(p.wobble ?? 1));
    const progress = f / Math.max(1, frameCount);
    const wob = wobble > 0 ? wobble : 0;
    const cx = (pos.x ?? 0.5) * w + Math.sin(progress * TAU * Math.max(1, wob)) * (w * 0.06 * wob);
    const cy = (pos.y ?? 0.5) * h + Math.cos(progress * TAU * Math.max(1, wob)) * (h * 0.04 * wob);
    const r = clamp(p.radius ?? 0.28, 0.05, 0.9) * Math.max(w, h);
    const soft = clamp(p.softness ?? 0.5, 0, 1);
    const dark = clamp(p.darkness ?? 0.85, 0, 1);

    // 전체 어둠(여유까지 덮기)
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(-w, -h, w * 3, h * 3);
    // 빛 구멍(부드러운 가장자리) 파내기
    ctx.globalCompositeOperation = 'destination-out';
    const inner = r * (1 - soft);
    const g = ctx.createRadialGradient(cx, cy, Math.max(0, inner), cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.restore();
  },
};
