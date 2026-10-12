// 레터박스 — 영화 띠가 들어왔다 나간다. 결정론·루프(양끝 0). 시드 무관. (분류: 연출)
import { parseColor, clamp } from './_fx-util.js';

export default {
  id: 'letterbox',
  name: '레터박스',
  category: '연출',
  description: '위아래 영화 띠가 들어왔다 나간다',
  thumbnail: { frame: 12, bg: '#303030' },
  bleed: 0,
  params: [
    { key: 'height', label: '띠 두께', type: 'float', default: 0.14, min: 0.02, max: 0.5, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#000000' },
    { key: 'orient', label: '방향', type: 'select', default: 'horizontal',
      options: [{ value: 'horizontal', label: '가로(위아래)' }, { value: 'vertical', label: '세로(좌우)' }] },
    { key: 'hold', label: '머무는 비율', type: 'float', default: 0.5, min: 0, max: 0.9, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const barFrac = clamp(p.height ?? 0.14, 0.02, 0.5);
    const color = parseColor(p.color ?? '#000000');
    const vertical = p.orient === 'vertical';
    const hold = clamp(p.hold ?? 0.5, 0, 0.9);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    // 사다리꼴 포락선: 0 → 1(들어옴) → 머묾 → 0(나감). 양끝 0 → 루프
    const inT = (1 - hold) / 2;
    let env;
    if (progress < inT) env = inT > 0 ? progress / inT : 1;
    else if (progress < inT + hold) env = 1;
    else env = inT > 0 ? Math.max(0, 1 - (progress - inT - hold) / inT) : 0;
    env = clamp(env, 0, 1);
    env = env * env * (3 - 2 * env); // 부드럽게
    const bar = barFrac * (vertical ? w : h) * env;
    if (bar <= 0.5) return;

    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${op})`;
    if (vertical) {
      ctx.fillRect(0, 0, bar, h);
      ctx.fillRect(w - bar, 0, bar, h);
    } else {
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }
  },
};
