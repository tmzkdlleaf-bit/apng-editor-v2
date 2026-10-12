// 불꽃 — 아래에서 타오르는 불길. 결정론·루프(정수 바퀴 깜빡). 시드 의존. (분류: 연출)
import { TAU, rgba, mix, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'flame',
  name: '불꽃',
  category: '연출',
  description: '아래에서 타오르는 불길',
  thumbnail: { frame: 10, bg: '#140600' },
  bleed: 8,
  params: [
    { key: 'height', label: '높이', type: 'float', default: 0.6, min: 0.1, max: 1, step: 0.01 },
    { key: 'tongues', label: '불꽃 수', type: 'int', default: 18, min: 3, max: 80 },
    { key: 'speed', label: '타오르는 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '속 색', type: 'color', default: '#fff2a0' },
    { key: 'color2', label: '겉 색', type: 'color', default: '#ff5a1e' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'fire', label: '주황 불', values: { color: '#fff2a0', color2: '#ff5a1e' } },
    { id: 'blue', label: '푸른 불', values: { color: '#dffbff', color2: '#2e86ff' } },
    { id: 'poison', label: '독 불', values: { color: '#eaffc2', color2: '#49d16a' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const height = clamp(p.height ?? 0.6, 0.1, 1) * h;
    const tongues = Math.max(3, Math.round(p.tongues ?? 18));
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const inner = parseColor(p.color ?? '#fff2a0');
    const outer = parseColor(p.color2 ?? '#ff5a1e');
    const midCol = mix(p.color ?? '#fff2a0', p.color2 ?? '#ff5a1e', 0.5);
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < tongues; i++) {
      const bx = rng();
      const wob = rng() * TAU;
      const hv = 0.5 + rng() * 0.5;
      const tw = (0.04 + rng() * 0.06) * w;
      const spd = speed + Math.floor(rng() * 2); // 정수 바퀴
      const fl = 0.6 + 0.4 * Math.sin(progress * TAU * spd + wob);
      const sway = Math.sin(progress * TAU * spd + wob * 1.3) * tw * 0.6; // 위상 상수 — 루프 유지
      const x = bx * w + sway;
      const th = height * hv * fl;
      const topY = h - th;
      const g = ctx.createLinearGradient(0, h, 0, topY);
      g.addColorStop(0, rgba(inner, op));
      g.addColorStop(0.3, rgba(midCol, op * 0.9));
      g.addColorStop(1, rgba(outer, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - tw, h);
      ctx.quadraticCurveTo(x - tw * 0.5, h - th * 0.5, x, topY);
      ctx.quadraticCurveTo(x + tw * 0.5, h - th * 0.5, x + tw, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
