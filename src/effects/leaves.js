// 낙엽 — 흩날리며 떨어지는 잎. 결정론·루프(frac 낙하 + 정수 바퀴 회전).
import { TAU, frac, mix, rgba, clamp } from './_fx-util.js';

const PRESET_COLORS = {
  autumn: ['#d9772e', '#b23b1e'],
  green: ['#6fae57', '#3f7d34'],
  mixed: ['#e0a92e', '#9a3b1e'],
};

function drawLeaf(ctx) {
  // 중심 기준 잎(끝 뾰족, 가운데 잎맥)
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.bezierCurveTo(0.8, -0.3, 0.5, 0.8, 0, 1);
  ctx.bezierCurveTo(-0.5, 0.8, -0.8, -0.3, 0, -1);
  ctx.fill();
}

export default {
  id: 'leaves',
  name: '낙엽',
  category: '날씨',
  description: '바람에 흩날리며 떨어지는 잎',
  thumbnail: { frame: 7, bg: '#120e08' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 30, min: 1, max: 200 },
    { key: 'size', label: '크기', type: 'float', default: 14, min: 4, max: 40, step: 0.5 },
    { key: 'rotation', label: '회전', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'wind', label: '바람', type: 'float', default: 0.35, min: -1, max: 1, step: 0.01 },
    { key: 'colors', label: '색', type: 'select', default: 'autumn',
      options: [{ value: 'autumn', label: '가을' }, { value: 'green', label: '초록' }, { value: 'mixed', label: '섞임' }] },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 30));
    const size = p.size ?? 14;
    const rot = Math.max(0, Math.round(p.rotation ?? 2));
    const wind = clamp(p.wind ?? 0.35, -1, 1);
    const [c1, c2] = PRESET_COLORS[p.colors] ?? PRESET_COLORS.autumn;
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng(), ct = rng();
      const cyc = 1 + (i % 2);
      const t = frac(by + progress * cyc);
      const y = t * (h + size * 2) - size;
      const x = bx * w + Math.sin(progress * TAU * cyc + ph * TAU) * w * 0.1 + wind * w * 0.35 * t;
      const sz = size * (0.6 + 0.7 * rs);
      const spin = progress * TAU * Math.max(1, rot) + ph * TAU;
      const col = mix(c1, c2, ct);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      // 뒤집힘(앞뒤 흔들림) — 세로 폭을 cos 로 눌러 팔랑임(정수 바퀴라 루프 유지)
      ctx.scale(sz, sz * (0.35 + 0.65 * Math.abs(Math.cos(spin))));
      ctx.fillStyle = rgba(col, op);
      drawLeaf(ctx);
      ctx.restore();
    }
  },
};
