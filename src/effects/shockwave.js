// 충격파 — 터지며 퍼지는 밝은 고리. 결정론·루프(frac 반복). 시드 무관. (분류: 연출)
import { TAU, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'shockwave',
  name: '충격파',
  category: '연출',
  description: '터지며 퍼지는 밝은 충격 고리',
  thumbnail: { frame: 6, bg: '#101010' },
  bleed: 8,
  params: [
    { key: 'bursts', label: '터지는 횟수', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '최대 크기', type: 'float', default: 1, min: 0.3, max: 1.6, step: 0.01 },
    { key: 'thickness', label: '두께', type: 'float', default: 0.12, min: 0.02, max: 0.4, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'intensity', label: '세기', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const bursts = Math.max(1, Math.round(p.bursts ?? 1));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const maxR = clamp(p.size ?? 1, 0.3, 1.6) * Math.min(w, h) * 0.5;
    const thick = clamp(p.thickness ?? 0.12, 0.02, 0.4) * maxR;
    const c = parseColor(p.color ?? '#ffffff');
    const intensity = clamp(p.intensity ?? 0.9, 0, 1);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const t = ((progress * bursts) % 1 + 1) % 1;
    const rr = t * maxR;
    if (rr <= 0.5) return;
    const fade = 1 - t;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const inner = Math.max(0, rr - thick), outer = rr + thick;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0)`);
    g.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},${op * intensity * fade})`);
    g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, outer, 0, TAU); ctx.fill();
    ctx.restore();
  },
};
