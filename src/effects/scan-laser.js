// 스캔 레이저 — 선이 위아래(또는 좌우)로 훑고 지나감 + 잔상. 결정론·루프(frac 스윕).
import { withAlpha, parseColor, rgba, frac, clamp } from './_fx-util.js';

export default {
  id: 'scan-laser',
  name: '스캔 레이저',
  category: '사이버',
  description: '밝은 선이 훑고 지나가며 잔상을 남긴다',
  thumbnail: { frame: 6, bg: '#040a0e' },
  bleed: 6,
  params: [
    { key: 'direction', label: '방향', type: 'select', default: 'vertical',
      options: [{ value: 'vertical', label: '위아래' }, { value: 'horizontal', label: '좌우' }] },
    { key: 'thickness', label: '굵기', type: 'float', default: 3, min: 1, max: 20, step: 0.5 },
    { key: 'passes', label: '횟수', type: 'int', default: 1, min: 1, max: 8 },
    { key: 'trail', label: '잔상', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#59ff8a' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const vertical = (p.direction ?? 'vertical') === 'vertical';
    const thick = p.thickness ?? 3;
    const passes = Math.max(1, Math.round(p.passes ?? 1));
    const trail = clamp(p.trail ?? 0.4, 0, 1);
    const color = p.color ?? '#59ff8a';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const c = parseColor(color);
    const progress = f / Math.max(1, frameCount);
    const t = frac(progress * passes); // 0..1

    const span = vertical ? h : w;
    const pos = t * span;
    const trailLen = trail * span * 0.5;

    ctx.save();
    // 잔상(지나온 쪽으로 그라디언트)
    if (trailLen > 1) {
      if (vertical) {
        const g = ctx.createLinearGradient(0, pos - trailLen, 0, pos);
        g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, op * 0.4));
        ctx.fillStyle = g; ctx.fillRect(0, pos - trailLen, w, trailLen);
      } else {
        const g = ctx.createLinearGradient(pos - trailLen, 0, pos, 0);
        g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, op * 0.4));
        ctx.fillStyle = g; ctx.fillRect(pos - trailLen, 0, trailLen, h);
      }
    }
    // 밝은 선
    ctx.fillStyle = withAlpha(color, op);
    if (vertical) ctx.fillRect(0, pos - thick / 2, w, thick);
    else ctx.fillRect(pos - thick / 2, 0, thick, h);
    // 선 중심 더 밝게
    ctx.fillStyle = withAlpha('#ffffff', op * 0.6);
    if (vertical) ctx.fillRect(0, pos - thick / 6, w, Math.max(1, thick / 3));
    else ctx.fillRect(pos - thick / 6, 0, Math.max(1, thick / 3), h);
    ctx.restore();
  },
};
