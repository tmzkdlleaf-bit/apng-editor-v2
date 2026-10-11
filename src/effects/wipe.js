// 슥삭 닦기 — 빛 띠가 빠르게 쓸고 지나감(1회). 양끝 화면 밖 → f=0==f=N 루프.
import { withAlpha, clamp, TAU } from './_fx-util.js';

export default {
  id: 'wipe',
  name: '슥삭 닦기',
  category: '빛',
  description: '빛 띠가 한 번 빠르게 쓸고 지나간다',
  thumbnail: { frame: 11, bg: '#101826' },
  bleed: 10,
  params: [
    { key: 'direction', label: '방향', type: 'float', default: 0, min: 0, max: 360, step: 1 },
    { key: 'width', label: '폭', type: 'float', default: 0.12, min: 0.02, max: 0.5, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const angle = (p.direction ?? 0) * Math.PI / 180;
    const bandW = clamp(p.width ?? 0.12, 0.02, 0.5) * Math.hypot(w, h);
    const color = p.color ?? '#ffffff';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount); // 0..1 한 번

    const diag = Math.hypot(w, h);
    // 중심이 -diag(완전 밖)에서 +diag(완전 밖)으로 이동 → f=0, f=N 모두 화면 밖(빈 그림)
    const pos = (progress * 2 - 1) * (diag + bandW);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(pos, 0);
    const g = ctx.createLinearGradient(-bandW, 0, bandW, 0);
    g.addColorStop(0, withAlpha(color, 0));
    g.addColorStop(0.5, withAlpha(color, op));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-bandW, -diag, bandW * 2, diag * 2);
    ctx.restore();
  },
};
