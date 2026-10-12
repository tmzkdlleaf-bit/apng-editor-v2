// 무대 커튼 — 양쪽 커튼이 열렸다 닫힌다. 결정론·루프(cos 왕복). 시드 무관. (분류: 연출)
import { TAU, mix, clamp } from './_fx-util.js';

export default {
  id: 'curtain',
  name: '무대 커튼',
  category: '연출',
  description: '양쪽 무대 커튼이 열렸다 닫힌다',
  thumbnail: { frame: 6, bg: '#201014' },
  bleed: 0,
  params: [
    { key: 'color', label: '색', type: 'color', default: '#8e1b2e' },
    { key: 'color2', label: '주름 색', type: 'color', default: '#4a0d18' },
    { key: 'folds', label: '주름 수', type: 'int', default: 8, min: 2, max: 24 },
    { key: 'open', label: '열림 정도', type: 'float', default: 0.9, min: 0.1, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'red', label: '붉은 막', values: { color: '#8e1b2e', color2: '#4a0d18' } },
    { id: 'blue', label: '푸른 막', values: { color: '#1b3a8e', color2: '#0d1c4a' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const c1 = p.color ?? '#8e1b2e';
    const c2 = p.color2 ?? '#4a0d18';
    const folds = Math.max(2, Math.round(p.folds ?? 8));
    const openMax = clamp(p.open ?? 0.9, 0.1, 1);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    // 열림: 0(닫힘) → openMax(열림) → 0(닫힘)
    const openAmt = openMax * (0.5 - 0.5 * Math.cos(progress * TAU));
    const half = (1 - openAmt) / 2 * w; // 각 커튼 폭
    if (half <= 0.5) return;

    const drawCurtain = (x0, dir) => {
      for (let k = 0; k < folds; k++) {
        const fx0 = x0 + (k / folds) * half * dir;
        const fw = (half / folds) * dir;
        const t = folds > 1 ? k / (folds - 1) : 0;
        const shade = 0.5 + 0.5 * Math.cos(t * TAU * 2); // 주름 음영(공간)
        const col = mix(c2, c1, 0.3 + 0.7 * shade);
        ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${op})`;
        ctx.fillRect(Math.min(fx0, fx0 + fw), 0, Math.abs(fw) + 1, h);
      }
    };
    drawCurtain(0, 1);   // 왼쪽 커튼: 0 → half
    drawCurtain(w, -1);  // 오른쪽 커튼: w → w-half
  },
};
