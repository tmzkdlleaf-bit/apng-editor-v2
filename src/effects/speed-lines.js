// 집중선 — 한 점으로 모이는 만화풍 집중선. 결정론·루프(정수 떨림). 시드 의존. (분류: 연출)
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'speed-lines',
  name: '집중선',
  category: '연출',
  description: '한 점으로 모이는 만화풍 집중선',
  thumbnail: { frame: 4, bg: '#f0f0f0' },
  bleed: 0,
  params: [
    { key: 'count', label: '선 수', type: 'int', default: 90, min: 10, max: 300 },
    { key: 'focus', label: '초점', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'hole', label: '가운데 빈 원', type: 'float', default: 0.18, min: 0, max: 0.6, step: 0.01 },
    { key: 'thickness', label: '굵기', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'speed', label: '떨림', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#101010' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'ink', label: '먹선', values: { color: '#101010' } },
    { id: 'white', label: '흰 집중선', values: { color: '#ffffff' } },
    { id: 'speed', label: '스피드', values: { color: '#2060ff', count: 140 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(10, Math.round(p.count ?? 90));
    const focus = p.focus ?? { x: 0.5, y: 0.5 };
    const fx = (focus.x ?? 0.5) * w, fy = (focus.y ?? 0.5) * h;
    const hole = clamp(p.hole ?? 0.18, 0, 0.6);
    const thick = p.thickness ?? 3;
    const speed = Math.max(0, Math.round(p.speed ?? 2));
    const color = p.color ?? '#101010';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const diag = Math.hypot(w, h);
    const r0base = hole * diag * 0.5;

    ctx.lineCap = 'butt';
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU + (rng() - 0.5) * (TAU / count);
      const jig = rng() * TAU;
      const lw = thick * (0.5 + rng());
      const alen = rng();
      const av = rng();
      const wobble = speed === 0 ? 0 : Math.sin(progress * TAU * speed + jig) * r0base * 0.25;
      const r0 = r0base + alen * r0base * 0.6 + wobble;
      ctx.strokeStyle = withAlpha(color, op * (0.5 + 0.5 * av));
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(fx + Math.cos(ang) * r0, fy + Math.sin(ang) * r0);
      ctx.lineTo(fx + Math.cos(ang) * diag, fy + Math.sin(ang) * diag);
      ctx.stroke();
    }
  },
};
