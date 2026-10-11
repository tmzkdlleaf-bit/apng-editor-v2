// 모래바람 — 가로로 흐르는 모래·먼지 바람 + 화면 뿌옇게. 결정론·루프(frac 흐름).
import { TAU, frac, withAlpha, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'sandstorm',
  name: '모래바람',
  category: '날씨',
  description: '가로로 흐르는 모래·먼지 바람',
  thumbnail: { frame: 6, bg: '#120d06' },
  bleed: 0,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 160, min: 1, max: 800 },
    { key: 'speed', label: '속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'direction', label: '방향', type: 'float', default: 8, min: -30, max: 30, step: 1 },
    { key: 'color', label: '색', type: 'color', default: '#d9b472' },
    { key: 'haze', label: '화면 뿌옇게', type: 'float', default: 0.35, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'dust', label: '먼지', values: { color: '#c9bfa6', haze: 0.25 } },
    { id: 'desert', label: '사막', values: { color: '#d9b472', amount: 300, haze: 0.5 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 160));
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const dir = (p.direction ?? 8) * Math.PI / 180;
    const col = parseColor(p.color ?? '#d9b472');
    const haze = clamp(p.haze ?? 0.35, 0, 1);
    const op = clamp(p.opacity ?? 0.5, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const dy = Math.tan(dir);

    // 뿌연 안개층(먼저 깔기)
    if (haze > 0) {
      ctx.fillStyle = withAlpha(p.color ?? '#d9b472', haze * 0.5);
      ctx.fillRect(0, 0, w, h);
    }

    // 가로 모래 줄기
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), cyc = speed + Math.floor(rng() * 2); // 정수 바퀴
      const len = (6 + rs * 40);
      const t = frac(bx + progress * cyc);
      const x = t * (w + len * 2) - len;
      const y = by * h + (x - bx * w) * dy * 0.2;
      const a = op * (0.25 + 0.6 * rs);
      ctx.strokeStyle = `rgba(${col.r},${col.g},${col.b},${a.toFixed(3)})`;
      ctx.lineWidth = 0.6 + rs * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y - len * dy);
      ctx.stroke();
    }
  },
};
