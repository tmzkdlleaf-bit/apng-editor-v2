// 반딧불(R28e) — 천천히 떠다니며 깜빡이는 빛 점. 결정론·루프(정수 주기).
import { TAU, clamp, parseColor, rgba } from './_fx-util.js';

export default {
  id: 'fireflies',
  name: '반딧불',
  category: '날씨',
  lightBg: true,
  description: '천천히 떠다니며 깜빡이는 빛 점(여름밤·숲·몽환)',
  thumbnail: { frame: 5, bg: '#0a120c' },
  bleed: 10,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 30, min: 1, max: 200 },
    { key: 'size', label: '크기', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#d8ff7a' },
    { key: 'blink', label: '깜빡임 횟수', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'roam', label: '떠다니는 범위', type: 'float', default: 0.08, min: 0, max: 0.3, step: 0.01 },
    { key: 'glow', label: '빛 번짐', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'band', label: '높이 범위', type: 'select', default: 'all',
      options: [{ value: 'all', label: '화면 전체' }, { value: 'low', label: '아래쪽' }] },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.count ?? 30));
    const size = Math.max(1, p.size ?? 3);
    const col = parseColor(p.color ?? '#d8ff7a');
    const blink = Math.max(1, Math.round(p.blink ?? 2));
    const roam = clamp(p.roam ?? 0.08, 0, 0.3);
    const glow = clamp(p.glow ?? 0.6, 0, 1);
    const low = p.band === 'low';
    const prog = f / Math.max(1, frameCount);
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), p1 = rng(), p2 = rng(), p3 = rng(), sz = rng();
      const x = (bx + roam * (Math.sin(TAU * prog + p1 * TAU) + 0.5 * Math.sin(TAU * 2 * prog + p2 * TAU))) * w;
      const y = ((low ? 0.55 + 0.45 * by : by) + roam * 0.8 * Math.sin(TAU * prog + p2 * TAU + 1.3)) * h;
      // 깜빡임: 대부분 어둡고 가끔 밝게(부드럽게)
      const b = Math.pow(Math.max(0, Math.sin(TAU * blink * prog + p3 * TAU)), 3);
      if (b < 0.02) continue;
      const r = size * (0.6 + 0.6 * sz);
      if (glow > 0) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * (3 + 5 * glow));
        g.addColorStop(0, rgba(col, 0.55 * b * glow)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * (3 + 5 * glow), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = rgba({ r: Math.min(255, col.r + 60), g: Math.min(255, col.g + 40), b: Math.min(255, col.b + 60) }, b);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  },
};
