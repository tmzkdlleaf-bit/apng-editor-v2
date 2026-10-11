// 꽃잎 — 흩날리는 꽃잎. 결정론·루프(frac 낙하 + 정수 바퀴 회전).
import { TAU, frac, mix, rgba, clamp } from './_fx-util.js';

function drawPetal(ctx, shape) {
  // 중심 기준 작은 꽃잎. shape: 'sakura'(끝 파임) | 'round'
  ctx.beginPath();
  if (shape === 'round') {
    ctx.ellipse(0, 0, 1, 0.6, 0, 0, TAU);
  } else {
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(0.7, -0.6, 0.6, 0.6, 0, 1);
    ctx.bezierCurveTo(-0.6, 0.6, -0.7, -0.6, 0, -1);
  }
  ctx.fill();
}

export default {
  id: 'petals',
  name: '꽃잎',
  category: '날씨',
  description: '바람에 흩날리는 꽃잎',
  thumbnail: { frame: 7, bg: '#140e14' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 40, min: 1, max: 300 },
    { key: 'size', label: '크기', type: 'float', default: 10, min: 3, max: 30, step: 0.5 },
    { key: 'rotation', label: '회전', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'wind', label: '바람', type: 'float', default: 0.3, min: -1, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffc2d6' },
    { key: 'color2', label: '색 2', type: 'color', default: '#ff8fb3' },
    { key: 'shape', label: '모양', type: 'select', default: 'sakura',
      options: [{ value: 'sakura', label: '벚꽃' }, { value: 'round', label: '둥근 잎' }] },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'sakura', label: '벚꽃', values: { shape: 'sakura', color: '#ffc2d6', color2: '#ff8fb3' } },
    { id: 'green', label: '초록 잎', values: { shape: 'round', color: '#9fd98a', color2: '#6fae57' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 40));
    const size = p.size ?? 10;
    const rot = Math.max(0, Math.round(p.rotation ?? 2));
    const wind = clamp(p.wind ?? 0.3, -1, 1);
    const shape = p.shape ?? 'sakura';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng(), ct = rng();
      const cyc = 1 + (i % 2);                        // 1~2바퀴 낙하(정수)
      const t = frac(by + progress * cyc);
      const y = t * (h + size * 2) - size;
      const x = bx * w + Math.sin(progress * TAU * cyc + ph * TAU) * w * 0.07 + wind * w * 0.3 * t;
      const sz = size * (0.6 + 0.6 * rs);
      const spin = progress * TAU * Math.max(1, rot) + ph * TAU;
      const col = mix(p.color ?? '#ffc2d6', p.color2 ?? '#ff8fb3', ct);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.scale(sz, sz * (0.6 + 0.4 * Math.abs(Math.cos(spin)))); // 뒤집힘 느낌
      ctx.fillStyle = rgba(col, op);
      drawPetal(ctx, shape);
      ctx.restore();
    }
  },
};
