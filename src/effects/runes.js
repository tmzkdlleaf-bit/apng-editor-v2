// 룬 문자 — 빛나는 룬 글리프가 떠오르며 명멸. 결정론·루프(frac 흐름·정수 바퀴 명멸). 시드 의존.
import { TAU, withAlpha, frac, clamp } from './_fx-util.js';

// 룬 글리프: [-1..1] 좌표의 선분 묶음(폰트·이모지 대신 직접 그린다)
const RUNES = [
  [[0, -1, 0, 1], [0, -0.3, 0.6, -0.9], [0, 0.1, 0.6, -0.5]],
  [[0, -1, 0, 1], [0, -1, 0.7, -0.6], [0, 0, 0.7, -0.4]],
  [[-0.5, -1, -0.5, 1], [0.5, -1, 0.5, 1], [-0.5, 0, 0.5, 0]],
  [[0, -1, 0, 1], [-0.6, -1, 0, -0.3], [0.6, -1, 0, -0.3]],
  [[0, -1, 0, 1], [-0.6, 0.6, 0, 0], [0.6, 0.6, 0, 0]],
  [[-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]],
  [[0, -1, -0.6, 0], [-0.6, 0, 0, 1], [0, 1, 0.6, 0], [0.6, 0, 0, -1]],
  [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.5, -0.4], [0.5, -0.4, -0.5, 0.1]],
];

export default {
  id: 'runes',
  name: '룬 문자',
  category: '판타지',
  description: '빛나는 룬 글리프가 떠오른다',
  thumbnail: { frame: 8, bg: '#0a0618' },
  bleed: 10,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 24, min: 1, max: 200 },
    { key: 'size', label: '크기', type: 'float', default: 16, min: 6, max: 48, step: 1 },
    { key: 'speed', label: '떠오르는 속도', type: 'int', default: 1, min: 0, max: 5 },
    { key: 'blink', label: '명멸 속도', type: 'int', default: 2, min: 0, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#8cf0ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'ice', label: '얼음', values: { color: '#8cf0ff' } },
    { id: 'arcane', label: '비전', values: { color: '#c79bff' } },
    { id: 'gold', label: '금빛', values: { color: '#ffd77a' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(1, Math.round(p.count ?? 24));
    const size = p.size ?? 16;
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const blink = Math.max(0, Math.round(p.blink ?? 2));
    const color = p.color ?? '#8cf0ff';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < count; i++) {
      const bx = rng(), by = rng(), gi = Math.floor(rng() * RUNES.length) % RUNES.length;
      const phase = rng() * TAU, sc = 0.6 + rng() * 0.8;
      const y = frac(by - progress * speed) * (h + size * 2) - size;
      const x = bx * w;
      const twinkle = blink === 0 ? 1 : Math.max(0, Math.sin(progress * TAU * blink + phase));
      const a = op * (0.25 + 0.75 * twinkle);
      if (a <= 0.01) continue;
      const s = size * sc * 0.5;
      ctx.strokeStyle = withAlpha(color, a);
      ctx.lineWidth = Math.max(1, size * 0.09);
      ctx.beginPath();
      for (const seg of RUNES[gi]) {
        ctx.moveTo(x + seg[0] * s, y + seg[1] * s);
        ctx.lineTo(x + seg[2] * s, y + seg[3] * s);
      }
      ctx.stroke();
    }
  },
};
