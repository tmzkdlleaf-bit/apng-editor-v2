// 색종이 — 축하하듯 흩날리는 색종이. 결정론·루프(frac 낙하·정수 회전). 시드 의존. (분류: 연출)
import { TAU, parseColor, frac, clamp } from './_fx-util.js';

const PALETTE = ['#ff5a6a', '#ffcf3a', '#5ad16a', '#4db8ff', '#c77bff', '#ff8fc7'];

export default {
  id: 'confetti',
  name: '색종이',
  category: '연출',
  description: '축하하듯 흩날리는 색종이',
  thumbnail: { frame: 12, bg: '#101218' },
  bleed: 12,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 120, min: 10, max: 500 },
    { key: 'size', label: '크기', type: 'float', default: 8, min: 3, max: 24, step: 0.5 },
    { key: 'speed', label: '낙하 속도', type: 'int', default: 1, min: 1, max: 5 },
    { key: 'spin', label: '회전', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'mode', label: '색', type: 'select', default: 'party',
      options: [{ value: 'party', label: '컬러풀' }, { value: 'mono', label: '단색' }] },
    { key: 'color', label: '단색 색', type: 'color', default: '#ffcf3a' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(10, Math.round(p.count ?? 120));
    const size = p.size ?? 8;
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const spin = Math.max(0, Math.round(p.spin ?? 2));
    const mono = p.mode === 'mono';
    const monoCol = parseColor(p.color ?? '#ffcf3a');
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < count; i++) {
      const bx = rng(), by = rng();
      const sw = 0.6 + rng() * 0.8;
      const swayAmp = (0.02 + rng() * 0.05) * w;
      const swayPh = rng() * TAU;
      const ci = Math.floor(rng() * PALETTE.length) % PALETTE.length;
      const spinPh = rng() * TAU;
      const fall = frac(by + progress * speed);
      const y = fall * (h + size * 2) - size;
      const x = bx * w + Math.sin(progress * TAU * speed + swayPh) * swayAmp;
      const rot = spinPh + progress * TAU * spin;
      const sx = Math.cos(rot); // 종이 앞뒤 뒤집힘(폭 변조)
      const col = mono ? monoCol : parseColor(PALETTE[ci]);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot); // 정수 바퀴(progress*TAU*spin) → 루프 이음매 유지
      ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${op})`;
      const ww = size * sw * Math.abs(sx) + 1, hh = size * sw;
      ctx.fillRect(-ww / 2, -hh / 2, ww, hh);
      ctx.restore();
    }
  },
};
