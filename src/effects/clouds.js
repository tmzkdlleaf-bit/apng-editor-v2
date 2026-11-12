// 구름 흘러가기(R28e) — 구름이 옆으로 흘러 지나간다. 한 번 재생에 몇 화면 지나가는지(정수) → 이음매 없음.
//   구름 하나 = 겹친 둥근 덩이 여러 개 + 아래쪽 그늘. 겹(1~3): 뒤 겹은 느리고 흐리게.
import { TAU, clamp, parseColor, rgba } from './_fx-util.js';

export default {
  id: 'clouds',
  name: '구름 흘러가기',
  category: '날씨',
  description: '구름이 옆으로 흘러 지나간다(하늘 배경·시간 흐름)',
  thumbnail: { frame: 4, bg: '#6aa6e6' },
  bleed: 0,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 6, min: 1, max: 30 },
    { key: 'size', label: '크기', type: 'float', default: 0.22, min: 0.05, max: 0.6, step: 0.01 },
    { key: 'top', label: '높이 범위 위', type: 'float', default: 0.05, min: 0, max: 1, step: 0.01 },
    { key: 'bottom', label: '높이 범위 아래', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'dir', label: '흐르는 방향', type: 'select', default: 'right',
      options: [{ value: 'right', label: '오른쪽으로' }, { value: 'left', label: '왼쪽으로' }] },
    { key: 'laps', label: '지나가는 화면 수', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'shade', label: '그늘 색', type: 'color', default: '#b9c6d8' },
    { key: 'depth', label: '겹 수', type: 'int', default: 2, min: 1, max: 3 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 6));
    const sz = clamp(p.size ?? 0.22, 0.05, 0.6) * w;
    const y0 = clamp(p.top ?? 0.05, 0, 1) * h, y1 = clamp(p.bottom ?? 0.5, 0, 1) * h;
    const dir = p.dir === 'left' ? -1 : 1;
    const laps = Math.max(1, Math.round(p.laps ?? 1));
    const col = parseColor(p.color ?? '#ffffff'), sh = parseColor(p.shade ?? '#b9c6d8');
    const depth = Math.max(1, Math.min(3, Math.round(p.depth ?? 2)));
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const prog = f / Math.max(1, frameCount);
    const span = w + sz * 2.4;                    // 구름이 완전히 화면 밖으로 나갔다 들어오는 거리
    for (let layer = depth - 1; layer >= 0; layer--) {
      const far = depth === 1 ? 0 : layer / (depth - 1);
      const k = 1 - 0.45 * far;                   // 뒤 겹: 작고 흐림
      const speedMul = layer + 1 <= laps ? Math.max(1, laps - layer) : 1;  // 정수 — 뒤 겹이 덜 지나감
      const m = Math.max(1, Math.round(n * (layer === 0 ? 1 : 0.7)));
      for (let i = 0; i < m; i++) {
        const bx = rng(), by = rng(), s = sz * k * (0.6 + 0.6 * rng()), lumps = 4 + Math.floor(rng() * 4);
        const offs = [];
        for (let j = 0; j < lumps; j++) offs.push([rng() - 0.5, rng(), 0.45 + 0.4 * rng()]);
        let x = (bx * span + dir * prog * speedMul * span) % span;
        if (x < 0) x += span;
        x -= sz * 1.2;
        const y = y0 + (y1 - y0) * by;
        const a = op * (1 - 0.45 * far);
        // 그늘(아래)
        ctx.fillStyle = rgba(sh, a);
        for (const [ox, oy, r] of offs) { ctx.beginPath(); ctx.ellipse(x + ox * s * 1.6, y + s * 0.12 + oy * s * 0.25, s * r * 0.62, s * r * 0.5, 0, 0, TAU); ctx.fill(); }
        // 몸통(위·밝게)
        ctx.fillStyle = rgba(col, a);
        for (const [ox, oy, r] of offs) { ctx.beginPath(); ctx.ellipse(x + ox * s * 1.6, y + oy * s * 0.25, s * r * 0.6, s * r * 0.48, 0, 0, TAU); ctx.fill(); }
      }
    }
  },
};
