// 빛줄기 — 빛 줄기/기둥(빛줄기·빛기둥 합침). 결정론·루프(흔들림 sin).
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'light-beams',
  name: '빛줄기',
  category: '빛',
  description: '빛 줄기 또는 빛기둥이 쏟아진다',
  thumbnail: { frame: 4, bg: '#0a0f1a' },
  bleed: 20,
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'rays',
      options: [{ value: 'rays', label: '빛줄기' }, { value: 'columns', label: '빛기둥' }] },
    { key: 'count', label: '개수', type: 'int', default: 10, min: 1, max: 60 },
    { key: 'thickness', label: '두께', type: 'float', default: 24, min: 2, max: 120, step: 1 },
    { key: 'direction', label: '방향', type: 'float', default: 90, min: 0, max: 360, step: 1, animatable: true },
    { key: 'wobble', label: '흔들림', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#fff2c0' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'rays', label: '빛줄기', values: { shape: 'rays', count: 10, thickness: 24 } },
    { id: 'columns', label: '빛기둥', values: { shape: 'columns', count: 8, thickness: 40, direction: 90 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const columns = p.shape === 'columns';
    const count = Math.max(1, Math.round(p.count ?? 10));
    const thick = p.thickness ?? 24;
    const wobble = Math.max(0, Math.round(p.wobble ?? 1));
    const color = p.color ?? '#fff2c0';
    const op = clamp(p.opacity ?? 0.5, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const diag = Math.hypot(w, h);

    ctx.save();
    if (columns) {
      // 수직 빛기둥 — 위에서 아래로 그라디언트
      for (let i = 0; i < count; i++) {
        const bx = (i + 0.5) / count;
        const jig = (rng() - 0.5) * 0.3;
        const ph = rng() * TAU;
        const x = (bx + jig) * w + Math.sin(progress * TAU * Math.max(1, wobble) + ph) * thick * 0.3 * wobble;
        const a = op * (0.4 + 0.6 * rng());
        const g = ctx.createLinearGradient(x, 0, x, h);
        g.addColorStop(0, withAlpha(color, a));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - thick / 2, 0, thick, h);
      }
    } else {
      // 한 점에서 뻗는 빛줄기
      const ang0 = (p.direction ?? 90) * Math.PI / 180;
      const ox = w / 2, oy = -h * 0.1;
      ctx.translate(ox, oy);
      for (let i = 0; i < count; i++) {
        const spread = (i / Math.max(1, count - 1) - 0.5) * Math.PI * 0.9;
        const ph = rng() * TAU;
        const wob = Math.sin(progress * TAU * Math.max(1, wobble) + ph) * 0.05 * wobble;
        const a = ang0 + spread + wob;
        const alpha = op * (0.3 + 0.7 * rng());
        ctx.save();
        ctx.rotate(a - Math.PI / 2);
        const g = ctx.createLinearGradient(0, 0, 0, diag);
        g.addColorStop(0, withAlpha(color, alpha));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-thick / 2, 0, thick, diag);
        ctx.restore();
      }
    }
    ctx.restore();
  },
};
