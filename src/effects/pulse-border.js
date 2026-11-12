// 맥동 테두리(R28b) — 화면 가장자리가 심장박동처럼 붉게 조여 온다. 두 번 뛰기(쿵-쿵)·핏줄 무늬.
//   결정론·루프(박동 수 정수).
import { TAU, clamp, parseColor, rgba, branchSegments, drawSegments } from './_fx-util.js';

// 한 박동 주기 안 [0,1) 위치 u 에서의 세기(0~1). 쿵(0) - 쿵(0.18) 두 번.
function _beat(u, dbl) {
  const g = (x, c, s) => Math.exp(-((x - c) ** 2) / (2 * s * s));
  const a = Math.max(g(u, 0.04, 0.045), g(u + 1, 0.04, 0.045));
  const b = dbl ? 0.75 * Math.max(g(u, 0.22, 0.05), g(u - 1, 0.22, 0.05)) : 0;
  return Math.min(1, a + b);
}

export default {
  id: 'pulse-border',
  name: '맥동 테두리',
  category: '공포',
  description: '가장자리가 심장박동처럼 붉게 조여 온다(긴장·부상·광기)',
  thumbnail: { frame: 1, bg: '#16100f' },
  bleed: 0,
  params: [
    { key: 'color', label: '색', type: 'color', default: '#8f0000' },
    { key: 'thickness', label: '두께', type: 'float', default: 0.35, min: 0.05, max: 0.8, step: 0.01 },
    { key: 'beats', label: '박동 수', type: 'int', default: 2, min: 1, max: 12 },
    { key: 'double', label: '두 번 뛰기', type: 'bool', default: true },
    { key: 'intensity', label: '세기', type: 'float', default: 0.85, min: 0, max: 1, step: 0.01 },
    { key: 'rest', label: '쉴 때 남는 정도', type: 'float', default: 0.35, min: 0, max: 1, step: 0.01 },
    { key: 'veins', label: '핏줄 무늬', type: 'float', default: 0.3, min: 0, max: 1, step: 0.05 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const col = parseColor(p.color ?? '#8f0000');
    const thick = clamp(p.thickness ?? 0.35, 0.05, 0.8);
    const beats = Math.max(1, Math.round(p.beats ?? 2));
    const prog = f / Math.max(1, frameCount);
    const u = (prog * beats) % 1;
    const pulse = _beat(u, p.double !== false);
    const inten = clamp(p.intensity ?? 0.85, 0, 1);
    const rest = clamp(p.rest ?? 0.35, 0, 1);
    const k = inten * (rest + (1 - rest) * pulse);
    // 화면 비율에 맞춘 타원 그라데이션: 단위 원 = 가장자리에 닿는 타원, 모서리는 √2.
    const inner = Math.max(0.02, 1 - thick * (0.85 + 0.35 * pulse));   // 뛸 때 안쪽으로 더 조여 옴
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / 2, h / 2);
    const g = ctx.createRadialGradient(0, 0, inner, 0, 0, Math.SQRT2);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.35, rgba(col, 0.6 * k));
    g.addColorStop(1, rgba(col, 0.95 * k));
    ctx.fillStyle = g;
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
    // 핏줄 무늬: 네 가장자리에서 안쪽으로 뻗는 가는 가지 선(밝기만 박동)
    const veins = clamp(p.veins ?? 0.3, 0, 1);
    if (veins > 0) {
      const n = Math.round(4 + veins * 14);
      const dark = { r: col.r * 0.6 | 0, g: col.g * 0.4 | 0, b: col.b * 0.4 | 0 };
      for (let i = 0; i < n; i++) {
        const side = i % 4, t = rng();
        const [x, y, a] = side === 0 ? [t * w, 0, Math.PI / 2] : side === 1 ? [w, t * h, Math.PI] : side === 2 ? [t * w, h, -Math.PI / 2] : [0, t * h, 0];
        const segs = branchSegments(rng, { x, y, angle: a + (rng() - 0.5) * 0.6, length: Math.min(w, h) * thick * (0.5 + 0.6 * rng()),
          depth: 2, branch: 0.45, spread: 0.8, jag: 0.7, segs: 6, shrink: 0.5 });
        ctx.globalAlpha = (0.35 + 0.65 * pulse) * inten;
        drawSegments(ctx, segs, 1, 1.4 + veins * 1.6, rgba(dark, 0.9));
      }
      ctx.globalAlpha = 1;
    }
  },
};
