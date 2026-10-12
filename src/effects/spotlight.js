// 스포트라이트 — 어둠 속에서 밝은 원이 비춘다. 결정론·루프(정수 궤도). 시드 무관. (분류: 연출)
import { TAU, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'spotlight',
  name: '스포트라이트',
  category: '연출',
  description: '어둠 속에서 밝은 원이 비춘다',
  thumbnail: { frame: 6, bg: '#101010' },
  bleed: 0,
  params: [
    { key: 'size', label: '빛 크기', type: 'float', default: 0.3, min: 0.05, max: 0.9, step: 0.01 },
    { key: 'darkness', label: '어둠', type: 'float', default: 0.75, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '어둠 색', type: 'color', default: '#000000' },
    { key: 'speed', label: '움직임 속도', type: 'int', default: 1, min: 0, max: 5 },
    { key: 'path', label: '이동 범위', type: 'float', default: 0.25, min: 0, max: 0.5, step: 0.01 },
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'softness', label: '부드러움', type: 'float', default: 0.5, min: 0.05, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const R = clamp(p.size ?? 0.3, 0.05, 0.9) * Math.min(w, h) * 0.5;
    const dark = clamp(p.darkness ?? 0.75, 0, 1);
    const color = parseColor(p.color ?? '#000000');
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const pathR = clamp(p.path ?? 0.25, 0, 0.5) * Math.min(w, h);
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const soft = clamp(p.softness ?? 0.5, 0.05, 1);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const cx = (pos.x ?? 0.5) * w + Math.cos(progress * TAU * speed) * pathR;
    const cy = (pos.y ?? 0.5) * h + Math.sin(progress * TAU * speed * 2) * pathR * 0.5; // 8자 궤도

    ctx.save();
    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${op * dark})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(cx, cy, Math.max(0, R * (1 - soft)), cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.restore();
  },
};
