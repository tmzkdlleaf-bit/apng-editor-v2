// 비 — 빗줄기(비·물보라 합침). 결정론·루프(frac 낙하, 정수 바퀴).
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'rain',
  name: '비',
  category: '날씨',
  description: '빗줄기(바닥 물보라 포함 가능)',
  thumbnail: { frame: 6, bg: '#0a0e14' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 120, min: 1, max: 600 },
    { key: 'thickness', label: '굵기', type: 'float', default: 1.5, min: 0.5, max: 6, step: 0.1 },
    { key: 'windAngle', label: '바람 각도', type: 'float', default: 12, min: -45, max: 45, step: 1 },
    { key: 'splash', label: '바닥 물보라', type: 'bool', default: true },
    { key: 'groundY', label: '바닥 높이', type: 'float', default: 0.92, min: 0.1, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#bcd4ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.55, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'drizzle', label: '이슬비', values: { amount: 60, thickness: 1, opacity: 0.4 } },
    { id: 'storm', label: '폭우', values: { amount: 300, thickness: 2, windAngle: 25 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 120));
    const thick = p.thickness ?? 1.5;
    const ang = (p.windAngle ?? 12) * Math.PI / 180;
    const splash = p.splash ?? true;
    const groundY = clamp(p.groundY ?? 0.92, 0.1, 1) * h;
    const color = p.color ?? '#bcd4ff';
    const op = clamp(p.opacity ?? 0.55, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const dxu = Math.sin(ang), dyu = Math.cos(ang);
    const fall = h * 1.1;

    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(color, op);
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), spd = 2 + Math.floor(rng() * 2); // 2~3바퀴(정수)
      const len = h * (0.05 + rng() * 0.06);
      const t = frac(by + progress * spd);
      const y = t * fall;
      const x = bx * w + dxu * y;
      ctx.lineWidth = thick * (0.7 + 0.6 * rng());
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dxu * len, y - dyu * len);
      ctx.stroke();
    }

    if (splash) {
      // 바닥 물보라 — 짧은 호가 깜빡(결정론·루프). 위치 고정, 시점만 위상.
      ctx.strokeStyle = withAlpha(color, op * 0.8);
      ctx.lineWidth = Math.max(0.8, thick * 0.7);
      const m = Math.max(4, Math.round(n * 0.15));
      for (let i = 0; i < m; i++) {
        const sx = rng() * w, ph = rng(), spd = 3 + Math.floor(rng() * 3);
        const t = frac(ph + progress * spd);
        const grow = Math.sin(t * Math.PI); // 0→1→0
        if (grow <= 0.05) continue;
        const rr = 2 + grow * 8;
        ctx.globalAlpha = op * (1 - t);
        ctx.beginPath(); ctx.arc(sx, groundY, rr, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  },
};
