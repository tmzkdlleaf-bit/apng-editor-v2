// 구름 흘러가기(R28e) — 구름이 옆으로 흘러 지나간다. 한 번 재생에 몇 화면 지나가는지(정수) → 이음매 없음.
//   구름 하나 = 겹친 둥근 덩이 여러 개 + 아래쪽 그늘. 겹(1~3): 뒤 겹은 느리고 흐리게.
import { TAU, clamp, parseColor, rgba, hash2, mix } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';

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
    LOOK_PARAM('real'),
    { key: 'sun', label: '해 방향(실사)', type: 'select', default: 'upleft',
      options: [{ value: 'upleft', label: '왼쪽 위' }, { value: 'up', label: '위' }, { value: 'upright', label: '오른쪽 위' }, { value: 'behind', label: '구름 뒤(역광)' }] },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
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

// R30 실사(지침 4-1 구름): 적운은 같은 높이(응결 고도)에서 아래가 평평하게 잘리고, 위는 크고 작은 둥근 덩이가 겹친 콜리플라워 모양.
//   해 쪽 면은 희고, 반대쪽은 푸른빛 회색 그늘. 역광이면 가장자리만 빛나고(은빛 테두리) 몸통은 어둡다.
//   먼 겹은 작고 대비가 낮고 하늘색에 섞인다(대기 원근). 흐르는 속도는 매우 느리게(지나가는 화면 수는 그대로 정수).
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const n = Math.max(1, Math.round(p.amount ?? 6));
  const sz = clamp(p.size ?? 0.22, 0.05, 0.6) * w;
  const y0 = clamp(p.top ?? 0.05, 0, 1) * h, y1 = clamp(p.bottom ?? 0.5, 0, 1) * h;
  const dir = p.dir === 'left' ? -1 : 1;
  const laps = Math.max(1, Math.round(p.laps ?? 1));
  const colHex = p.color ?? '#ffffff', shHex = p.shade ?? '#b9c6d8';
  const depth = Math.max(1, Math.min(3, Math.round(p.depth ?? 2)));
  const op = clamp(p.opacity ?? 0.95, 0, 1);
  const sun = p.sun ?? 'upleft';
  const sv = sun === 'up' ? [0, -1] : sun === 'upright' ? [0.7, -0.7] : sun === 'behind' ? null : [-0.7, -0.7];
  const fc = Math.max(1, env.frameCount), prog = (((env.f % fc) + fc) % fc) / fc;
  const span = w + sz * 2.4;
  const seed = Math.floor(rng() * 1e6);
  for (let layer = depth - 1; layer >= 0; layer--) {
    const far = depth === 1 ? 0 : layer / (depth - 1);
    const k = 1 - 0.45 * far;
    const speedMul = layer + 1 <= laps ? Math.max(1, laps - layer) : 1;
    const haze = 0.45 * far;                                  // 먼 겹: 하늘색 쪽으로(대비 낮춤)
    const lit = mix(colHex, '#bcd3ee', haze), shade = mix(shHex, '#9fb6d2', haze);
    const m = Math.max(1, Math.round(n * (layer === 0 ? 1 : 0.7)));
    for (let i = 0; i < m; i++) {
      const H = (q) => hash2(i + layer * 101, q, seed);
      const s = sz * k * (0.6 + 0.6 * H(1));
      let x = (H(2) * span + dir * prog * speedMul * span) % span;
      if (x < 0) x += span;
      x -= sz * 1.2;
      const base = y0 + (y1 - y0) * (0.55 + 0.45 * H(3) * 0.4) ; // 같은 겹은 바닥 높이가 비슷(응결 고도)
      // 덩이: 바닥 근처 넓고 낮은 것 → 위로 갈수록 작아지며 쌓임. 크기 3단계.
      const lumps = [];
      const nl = 9 + Math.floor(H(4) * 8);
      for (let j = 0; j < nl; j++) {
        const q = hash2(i * 31 + j, 5 + layer, seed);
        const tier = q < 0.12 ? 1 : q < 0.5 ? 0.6 : 0.35;
        const r = s * 0.34 * tier * (0.8 + 0.4 * hash2(i * 31 + j, 6, seed));
        const ox = (hash2(i * 31 + j, 7, seed) - 0.5) * s * 1.7 * (1 - 0.3 * (1 - tier));
        const up = hash2(i * 31 + j, 8, seed) * s * 0.55 * (1.2 - tier);
        lumps.push([x + ox, base - r * 0.55 - up, r]);
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(x - s * 2.5, base - s * 3, s * 5, s * 3); ctx.clip();   // 평평한 바닥
      const a = op * (1 - 0.35 * far);
      const path = (k) => { ctx.beginPath(); for (const [lx, ly, r] of lumps) { ctx.moveTo(lx + r * k, ly); ctx.arc(lx, ly, r * k, 0, TAU); } };
      const top = base - s * 1.1;
      if (sv) {
        // 구름 전체에 하나의 빛: 해 쪽이 희고 반대쪽·아래가 푸른 회색(덩이마다 따로 빛나지 않게 → 거품처럼 안 보임)
        const gx0 = x + sv[0] * s, gy0 = (top + base) / 2 + sv[1] * s * 0.6;
        const gx1 = x - sv[0] * s, gy1 = (top + base) / 2 - sv[1] * s * 0.6;
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, rgba(lit, a)); g.addColorStop(0.45, rgba(mix(colHex, shHex, 0.3 + 0.3 * haze), a)); g.addColorStop(1, rgba(shade, a));
        ctx.fillStyle = g; path(1); ctx.fill();
        // 덩이 사이 골: 안쪽 덩이(작게 줄인)에 아주 옅은 그늘 → 콜리플라워 결
        ctx.globalCompositeOperation = 'source-atop';
        for (const [lx, ly, r] of lumps) {
          const gg = ctx.createRadialGradient(lx + sv[0] * r * 0.3, ly + sv[1] * r * 0.3, r * 0.5, lx, ly, r * 1.05);
          gg.addColorStop(0, rgba(lit, 0)); gg.addColorStop(0.8, rgba(shade, a * 0.16)); gg.addColorStop(1, rgba(shade, 0));
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(lx, ly, r * 1.05, 0, TAU); ctx.fill();
        }
      } else {
        // 역광: 몸통은 어둡고, 얇은 가장자리만 빛이 비친다(은빛 테두리)
        ctx.fillStyle = rgba(mix(colHex, '#fff6e0', 0.4), a); path(1); ctx.fill();
        ctx.fillStyle = rgba(mix(shHex, '#5d6b80', 0.35), a); path(0.9); ctx.fill();
        ctx.globalCompositeOperation = 'source-atop';
      }
      // 바닥 쪽이 가장 어둡다
      const bg = ctx.createLinearGradient(0, base - s * 0.4, 0, base);
      bg.addColorStop(0, rgba(shade, 0)); bg.addColorStop(1, rgba(mix(shHex, '#6f7f96', 0.35), a * 0.5));
      ctx.fillStyle = bg; ctx.fillRect(x - s * 2.5, base - s * 0.4, s * 5, s * 0.4);
      ctx.restore();
    }
  }
}
