// 창문 빗물 — 유리에 맺혀 흘러내리는 물방울. 결정론·루프.
// 소스(배경) 연결 시 물방울 안에 배경이 비쳐 굴절 느낌. 없으면 유리알만.
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'window-rain',
  name: '창문 빗물',
  category: '날씨',
  description: '유리에 맺혀 흘러내리는 물방울(배경 굴절 가능)',
  thumbnail: { frame: 9, bg: '#0a0e14' },
  bleed: 0,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 50, min: 1, max: 300 },
    { key: 'size', label: '크기', type: 'float', default: 10, min: 3, max: 30, step: 0.5 },
    { key: 'runFreq', label: '흘러내림 빈도', type: 'float', default: 0.3, min: 0, max: 1, step: 0.01 },
    { key: 'refraction', label: '굴절 세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#cfe2ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.85, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  sources: [{ key: 'bg', label: '배경' }],
  render(ctx, { f, frameCount, w, h, rng, sources, pad = 0 }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 50));
    const size = p.size ?? 10;
    const runFreq = clamp(p.runFreq ?? 0.3, 0, 1);
    const refraction = clamp(p.refraction ?? 0.6, 0, 1);
    const color = p.color ?? '#cfe2ff';
    const op = clamp(p.opacity ?? 0.85, 0, 1);
    const progress = f / Math.max(1, frameCount);

    // 물방울 목록(한 번의 rng 순서) — 마스크·하이라이트가 같은 위치를 쓰도록 미리 계산.
    const beads = [];
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng(), runs = rng();
      const r = size * (0.4 + 0.8 * rs);
      const sliding = runs < runFreq;
      const t = sliding ? frac(ph + progress * (1 + (i % 2))) : 0;
      beads.push({ x: bx * w, y: by * h + (sliding ? t * h * 0.6 : 0), r, t, sliding });
    }

    // 1) 물방울 모양(마스크)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (const b of beads) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      if (b.sliding && b.t > 0.02) {
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 0.4, b.y);
        ctx.lineTo(b.x + b.r * 0.4, b.y);
        ctx.lineTo(b.x, b.y - b.t * h * 0.55);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();

    // 2) 물방울 안 채우기 — 소스 배경(굴절) 또는 유리알 색
    const src = (sources || []).find((s) => s.key === 'bg')?.canvas;
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    if (src && refraction > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const mag = 1 + refraction * 0.15;
      const dw = src.width * mag, dh = src.height * mag;
      ctx.drawImage(src, pad - (dw - src.width) / 2, pad - (dh - src.height) / 2, dw, dh);
    } else {
      ctx.fillStyle = withAlpha(color, op);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();

    // 3) 하이라이트(유리 느낌)
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = withAlpha('#ffffff', op * 0.7);
    for (const b of beads) {
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
};
