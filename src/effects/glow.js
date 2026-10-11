// 빛무리 — 레이어나 화면 일부를 감싸는 부드러운 빛. 결정론·루프.
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'glow',
  name: '빛무리',
  category: '빛',
  description: '부드럽게 번지는 빛무리(맥동 가능)',
  thumbnail: { frame: 6, bg: '#0a0f1a' },
  bleed: 40,
  params: [
    { key: 'center', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'radius', label: '반경', type: 'float', default: 0.45, min: 0.05, max: 1.2, step: 0.01 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
    { key: 'pulse', label: '맥동', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#ffd27a' },
  ],
  presets: [
    { id: 'warm', label: '따뜻한', values: { color: '#ffd27a' } },
    { id: 'cool', label: '차가운', values: { color: '#8fc6ff' } },
    { id: 'magic', label: '마법', values: { color: '#c79bff', pulse: 2 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const c = p.center ?? { x: 0.5, y: 0.5 };
    const cx = (c.x ?? 0.5) * w, cy = (c.y ?? 0.5) * h;
    const base = (p.radius ?? 0.45) * Math.max(w, h);
    const intensity = clamp(p.intensity ?? 0.7, 0, 1);
    const pulse = Math.max(0, Math.round(p.pulse ?? 1));
    const color = p.color ?? '#ffd27a';
    const progress = f / Math.max(1, frameCount);
    const mod = pulse > 0 ? (0.8 + 0.2 * Math.sin(progress * TAU * pulse)) : 1;
    const r = Math.max(1, base * mod);

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(color, intensity));
    g.addColorStop(0.5, withAlpha(color, intensity * 0.4));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  },
};
