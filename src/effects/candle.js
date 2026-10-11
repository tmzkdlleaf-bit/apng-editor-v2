// 촛불 일렁임 — 화면 밝기가 촛불처럼 흔들림. 결정론·루프(정수 주파수 사인 합).
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'candle',
  name: '촛불 일렁임',
  category: '빛',
  description: '촛불처럼 화면 밝기가 불규칙하게 흔들린다',
  thumbnail: { frame: 5, bg: '#120a04' },
  bleed: 0,
  params: [
    { key: 'intensity', label: '세기', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'irregularity', label: '불규칙 정도', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색 온도', type: 'color', default: '#ffb15a' },
    { key: 'center', label: '중심', type: 'coord', default: { x: 0.5, y: 0.55 } },
  ],
  presets: [
    { id: 'warm', label: '따뜻한 촛불', values: { color: '#ffb15a' } },
    { id: 'fire', label: '모닥불', values: { color: '#ff7a2a', intensity: 0.7, irregularity: 0.8 } },
  ],
  scopes: ['full'], // 화면 전체 밝기 흔들림 — 박스는 의미가 적어 제외.
  sources: [],
  render(ctx, { f, frameCount, w, h }, p) {
    const intensity = clamp(p.intensity ?? 0.5, 0, 1);
    const irr = clamp(p.irregularity ?? 0.6, 0, 1);
    const color = p.color ?? '#ffb15a';
    const c = p.center ?? { x: 0.5, y: 0.55 };
    const cx = (c.x ?? 0.5) * w, cy = (c.y ?? 0.55) * h;
    const progress = f / Math.max(1, frameCount);
    const t = progress * TAU;
    // 정수 주파수 사인 합 → 루프 유지. 불규칙할수록 높은 주파수 비중 ↑.
    let flick = 0.6 * Math.sin(t) + irr * (0.25 * Math.sin(t * 3 + 1.3) + 0.15 * Math.sin(t * 7 + 2.1));
    flick = 0.78 + 0.22 * flick; // 0.5~1 근처

    const r = Math.max(w, h) * (0.7 + 0.08 * flick);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(color, intensity * flick));
    g.addColorStop(0.55, withAlpha(color, intensity * 0.35 * flick));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  },
};
