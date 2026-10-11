// 반짝임 — 별 모양 반짝임이 생겼다 사라짐. 결정론·루프(progress=f/frameCount).
import { TAU, withAlpha, clamp } from './_fx-util.js';

function drawSpark(ctx, x, y, r, arms, rot, color, a) {
  if (a <= 0 || r <= 0.3) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = withAlpha(color, a);
  ctx.lineCap = 'round';
  for (let k = 0; k < arms; k++) {
    const ang = (k / arms) * TAU;
    const len = (k % 2 === 0 || arms === 6) ? r : r * 0.5;
    ctx.lineWidth = Math.max(0.6, r * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
    ctx.stroke();
  }
  // 밝은 중심점
  ctx.fillStyle = withAlpha(color, a);
  ctx.beginPath(); ctx.arc(0, 0, Math.max(0.6, r * 0.22), 0, TAU); ctx.fill();
  ctx.restore();
}

export default {
  id: 'sparkle',
  name: '반짝임',
  category: '빛',
  description: '별 모양 반짝임이 생겼다 사라진다',
  thumbnail: { frame: 6, bg: '#101826' },
  bleed: 10,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 40, min: 1, max: 400 },
    { key: 'size', label: '크기', type: 'float', default: 10, min: 2, max: 40, step: 0.5 },
    { key: 'speed', label: '깜빡 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#ffe9a8' },
    { key: 'shape', label: '모양', type: 'select', default: 'four',
      options: [{ value: 'cross', label: '십자' }, { value: 'four', label: '네 갈래' }, { value: 'six', label: '여섯 갈래' }] },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'gold', label: '금빛', values: { color: '#ffe9a8', shape: 'four', size: 10 } },
    { id: 'ice', label: '얼음', values: { color: '#bfe8ff', shape: 'six', size: 8 } },
    { id: 'dense', label: '촘촘', values: { count: 160, size: 6, speed: 3 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(1, Math.round(p.count ?? 40));
    const size = p.size ?? 10;
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const color = p.color ?? '#ffe9a8';
    const arms = p.shape === 'cross' ? 4 : p.shape === 'six' ? 6 : 4;
    const rotBase = p.shape === 'four' ? Math.PI / 4 : 0;
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);

    for (let i = 0; i < count; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const rr = size * (0.5 + rng());
      const phase = rng() * TAU;
      const spin = (rng() - 0.5) * 0.6;
      // 깜빡임: 0..1 펄스(루프). max(0) 로 "꺼짐" 구간을 만든다.
      const pulse = Math.max(0, Math.sin(progress * TAU * speed + phase));
      drawSpark(ctx, x, y, rr * (0.3 + 0.7 * pulse), arms, rotBase + spin, color, op * pulse);
    }
  },
};
