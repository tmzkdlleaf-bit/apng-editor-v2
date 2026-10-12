// 입자 — 작은 입자(먼지·빛가루·포자·자유 합침). 결정론·루프.
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

function drawShape(ctx, kind, x, y, r, color, a) {
  if (a <= 0.01 || r <= 0.2) return;
  if (kind === 'sparkle') {
    ctx.strokeStyle = withAlpha(color, a); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.6, r * 0.4);
    for (let k = 0; k < 4; k++) { const an = (k / 4) * TAU; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); ctx.stroke(); }
    ctx.fillStyle = withAlpha(color, a); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.fill();
  } else if (kind === 'lightdrop') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, withAlpha(color, a)); g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
  } else { // dot
    ctx.fillStyle = withAlpha(color, a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}

export default {
  id: 'particles',
  name: '입자',
  category: '파티클',
  description: '먼지·빛가루·포자 같은 작은 입자',
  thumbnail: { frame: 8, bg: '#0a0c12' },
  bleed: 10,
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'dot',
      options: [{ value: 'dot', label: '점' }, { value: 'sparkle', label: '반짝' }, { value: 'lightdrop', label: '빛 방울' }] },
    { key: 'movement', label: '움직임', type: 'select', default: 'float',
      options: [{ value: 'float', label: '떠다님' }, { value: 'rise', label: '상승' }, { value: 'fall', label: '낙하' }] },
    { key: 'amount', label: '양', type: 'int', default: 80, min: 1, max: 500 },
    { key: 'size', label: '크기', type: 'float', default: 4, min: 1, max: 20, step: 0.5 },
    { key: 'speed', label: '속도', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#ffe9b0' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'dust', label: '먼지', values: { shape: 'dot', movement: 'float', size: 2.5, color: '#c7cdd8', opacity: 0.5 } },
    { id: 'glitter', label: '빛가루', values: { shape: 'sparkle', movement: 'float', size: 6, color: '#ffe17a' } },
    { id: 'spore', label: '포자', values: { shape: 'lightdrop', movement: 'rise', size: 5, color: '#bfe6a8' } },
    { id: 'free', label: '자유 입자', values: { shape: 'dot', movement: 'fall', size: 4, color: '#ffe9b0' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const shape = p.shape ?? 'dot';
    const move = p.movement ?? 'float';
    const n = Math.max(1, Math.round(p.amount ?? 80));
    const size = p.size ?? 4;
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const color = p.color ?? '#ffe9b0';
    const op = clamp(p.opacity ?? 0.7, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng();
      let x, y, a = op * (0.4 + 0.6 * rs);
      if (move === 'rise') {
        const t = frac(by - progress * speed); y = t * (h + size * 2) - size;
        x = bx * w + Math.sin(progress * TAU * speed + ph * TAU) * w * 0.03;
      } else if (move === 'fall') {
        const t = frac(by + progress * speed); y = t * (h + size * 2) - size;
        x = bx * w + Math.sin(progress * TAU * speed + ph * TAU) * w * 0.03;
      } else { // float — net-zero 떠다님(루프)
        x = bx * w + Math.sin(progress * TAU * speed + ph * TAU) * w * 0.05;
        y = by * h + Math.cos(progress * TAU * speed + ph * TAU) * h * 0.05;
        a *= 0.6 + 0.4 * Math.sin(progress * TAU * speed + ph * TAU + 1.3); // 은은한 깜빡
        a = Math.max(0, a);
      }
      drawShape(ctx, shape, x, y, size * (0.5 + 0.7 * rs), color, a);
    }
  },
};
