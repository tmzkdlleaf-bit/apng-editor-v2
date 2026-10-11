// 렌즈 플레어 — 광원과 렌즈 번짐 고리들. 결정론·루프(은은한 맥동).
import { TAU, withAlpha, parseColor, rgba, clamp, lerp } from './_fx-util.js';

export default {
  id: 'lens-flare',
  name: '렌즈 플레어',
  category: '빛',
  description: '광원에서 번지는 렌즈 플레어 고리',
  thumbnail: { frame: 6, bg: '#0a0f1a' },
  bleed: 40,
  params: [
    { key: 'origin', label: '광원 위치', type: 'coord', default: { x: 0.72, y: 0.28 }, animatable: true },
    { key: 'ghosts', label: '고리 수', type: 'int', default: 6, min: 0, max: 16 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색조', type: 'color', default: '#ffdca8' },
  ],
  scopes: ['full'], // 화면 전체를 가로지르는 고리들 — 박스는 의미가 적어 제외.
  sources: [],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const o = p.origin ?? { x: 0.72, y: 0.28 };
    const ox = (o.x ?? 0.72) * w, oy = (o.y ?? 0.28) * h;
    const ghosts = Math.max(0, Math.round(p.ghosts ?? 6));
    const intensity = clamp(p.intensity ?? 0.8, 0, 1);
    const color = p.color ?? '#ffdca8';
    const progress = f / Math.max(1, frameCount);
    const twinkle = 0.85 + 0.15 * Math.sin(progress * TAU); // 1바퀴 맥동(루프)
    const cx = w / 2, cy = h / 2;
    const dx = cx - ox, dy = cy - oy;

    ctx.save();
    // 주 광원
    const coreR = Math.max(w, h) * 0.28 * twinkle;
    let g = ctx.createRadialGradient(ox, oy, 0, ox, oy, coreR);
    g.addColorStop(0, withAlpha('#ffffff', intensity * twinkle));
    g.addColorStop(0.2, withAlpha(color, intensity * 0.8 * twinkle));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(ox - coreR, oy - coreR, coreR * 2, coreR * 2);

    // 고리(ghost) — 광원→중심 선을 따라 반대편까지
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < ghosts; i++) {
      const t = lerp(-0.3, 1.7, rng());
      const gx = ox + dx * 2 * t, gy = oy + dy * 2 * t;
      const gr = (6 + rng() * 40) * (0.6 + 0.4 * twinkle);
      const a = intensity * (0.08 + 0.12 * rng());
      const c = parseColor(color);
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, rgba(c, a));
      gg.addColorStop(0.7, rgba(c, a * 0.5));
      gg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
};
