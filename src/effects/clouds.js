// 구름 흘러가기(R28e) — 구름이 옆으로 흘러 지나간다. 한 번 재생에 몇 화면 지나가는지(정수) → 이음매 없음.
//   구름 하나 = 겹친 둥근 덩이 여러 개 + 아래쪽 그늘. 겹(1~3): 뒤 겹은 느리고 흐리게.
import { TAU, clamp, parseColor, rgba, hash2, mix, fbm, drawField } from './_fx-util.js';
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

// R30 실사(지침 4-1 구름) — R30d 개편: 구름 하나를 '밀도 지도'로 계산해 칠한다(공 모양 덩이를 겹쳐 그리지 않음).
//   모양: 둥근 덩이들의 밀도 합 − 노이즈로 깎은 가장자리(뭉게뭉게한 윤곽), 아래는 같은 높이에서 부드럽게 평평(응결 고도).
//   빛: 각 점에서 해 쪽으로 조금 간 곳의 밀도가 높을수록 그늘(스스로 가림) → 덩이 사이 골·아래쪽이 자연스럽게 어두워짐.
//   역광이면 얇은 가장자리만 밝게 빛나고(은빛 테두리) 두꺼운 몸통은 어둡다.
//   원근: 먼 구름일수록 작고, 지평선 쪽(아래)으로 내려오고, 하늘색에 섞여 대비가 낮다.
function renderReal(ctx, env, p) {
  const { w, h, rng, borrow, release } = env;
  const n = Math.max(1, Math.round(p.amount ?? 6));
  const sz = clamp(p.size ?? 0.22, 0.05, 0.6) * w;
  const y0 = clamp(p.top ?? 0.05, 0, 1) * h, y1 = clamp(p.bottom ?? 0.5, 0, 1) * h;
  const dir = p.dir === 'left' ? -1 : 1;
  const laps = Math.max(1, Math.round(p.laps ?? 1));
  const C = parseColor(p.color ?? '#ffffff'), Sh = parseColor(p.shade ?? '#b9c6d8');
  const SKY = { r: 170, g: 196, b: 228 };
  const depth = Math.max(1, Math.min(3, Math.round(p.depth ?? 2)));
  const op = clamp(p.opacity ?? 0.95, 0, 1);
  const sun = p.sun ?? 'upleft';
  const back = sun === 'behind';
  const sv = sun === 'up' ? [0, -1] : sun === 'upright' ? [0.7, -0.7] : sun === 'behind' ? [0, -1] : [-0.7, -0.7];
  const fc = Math.max(1, env.frameCount), prog = (((env.f % fc) + fc) % fc) / fc;
  const seed = Math.floor(rng() * 1e6);
  const toO = (c) => (Array.isArray(c) ? { r: c[0], g: c[1], b: c[2] } : c);
  const lerpC = (a, b, t) => { a = toO(a); b = toO(b); return [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t]; };
  for (let layer = depth - 1; layer >= 0; layer--) {
    const far = depth === 1 ? 0 : layer / (depth - 1);
    const k = 1 - 0.5 * far;                                  // 먼 겹은 작게
    const haze = 0.5 * far;                                   // 먼 겹은 하늘색에 섞임
    const speedMul = layer + 1 <= laps ? Math.max(1, laps - layer) : 1;
    // 바닥 높이: 가까운 겹은 위쪽, 먼 겹은 지평선(아래)쪽 — 범위 안에서 겹마다 다르게
    const baseY = y0 + (y1 - y0) * (depth === 1 ? 0.8 : 0.6 + 0.4 * far);
    const m = Math.max(1, Math.round(n * (layer === 0 ? 0.7 : 0.6)));
    const span = w + sz * 3;
    for (let i = 0; i < m; i++) {
      const H = (q) => hash2(i + layer * 101, q, seed);
      const s = sz * k * (0.85 + 0.6 * H(1));                 // 구름 너비 기준
      const wide = 0.9 + 0.8 * H(9);                          // 넓적한 정도
      let cx = (H(2) * span + dir * prog * speedMul * span) % span;
      if (cx < 0) cx += span;
      cx -= sz * 1.5;
      // 같은 겹은 바닥 높이가 거의 같다. 다만 구름 꼭대기가 범위 위로 넘치지 않게 내린다.
      const by = Math.max(baseY + (H(3) - 0.5) * s * 0.12, y0 + s * 1.05);
      const a0 = op * (1 - 0.3 * far);
      const bx0 = -1.25 * wide - 0.25, bx1 = 1.25 * wide + 0.25, byT = -1.3, byB = 0.05;
      const cols = Math.max(32, Math.min(220, Math.round((bx1 - bx0) * s / 2.5))), rows = Math.max(16, Math.min(120, Math.round((byB - byT) * s / 2.5)));
      const key = [seed, i, layer, s.toFixed(1), wide.toFixed(3), cols, rows, sun, a0.toFixed(3), haze, p.color, p.shade].join('|');
      let rgba = CACHE.get(key);
      if (!rgba) {
        rgba = buildCloud({ i, layer, seed, wide, cols, rows, bx0, bx1, byT, byB, sv, back, C, Sh, SKY, haze, a0, lerpC });
        CACHE.set(key, rgba);
        if (CACHE.size > 80) CACHE.delete(CACHE.keys().next().value);   // 오래된 것부터 버림
      }
      // 구름 모양·명암은 시간에 따라 바뀌지 않으므로(흘러가기만) 한 번 계산한 칸 그림을 다시 쓴다(결정론 유지)
      const tmp = borrow(cols, rows);
      const tc = tmp.getContext('2d');
      const img = tc.createImageData(cols, rows);
      img.data.set(rgba);
      tc.putImageData(img, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(tmp, 0, 0, cols, rows, cx + bx0 * s, by + byT * s, (bx1 - bx0) * s, (byB - byT) * s);
      ctx.restore();
      release(tmp);
    }
  }
}
const CACHE = new Map();

// 구름 하나의 칸 그림(RGBA) 계산 — 모양(밀도) + 해 쪽 가림 명암. 결정론(시드·번호로만).
function buildCloud(o) {
  const { i, layer, seed, wide, cols, rows, bx0, bx1, byT, byB, sv, back, C, Sh, SKY, haze, a0, lerpC } = o;
  // 덩이: 돔(가운데 높고 양옆 낮음) 윤곽을 따라 큰 덩이는 아래·가운데, 작은 덩이는 위·가장자리 → 콜리플라워 결
  const L = [];
  const nl = 18 + Math.floor(hash2(i, 4 + layer, seed) * 10);
  for (let j = 0; j < nl; j++) {
    const q = (k2) => hash2(i * 37 + j + layer * 911, k2, seed);
    const ox = (q(1) * 2 - 1) * wide;
    const prof = 1 - (ox / wide) ** 2;                       // 돔 높이 0~1
    const tier = q(2) < 0.25 ? 0.34 : q(2) < 0.6 ? 0.22 : 0.13;
    const lift = q(3) * prof * 0.95;                          // 쌓인 높이
    const r = tier * (0.75 + 0.5 * prof) * (1 - 0.35 * lift);
    L.push([ox, -r * 0.6 - lift, r]);
  }
  const ns = seed % 997 + i * 13 + layer * 71;
  const field = new Float32Array(cols * rows);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const x = bx0 + (gx + 0.5) / cols * (bx1 - bx0), y = byT + (gy + 0.5) / rows * (byB - byT);
    // 덩이 합집합(가장 가까운 덩이 안쪽 깊이) — 덩이마다 둥근 윤곽이 살아 있다(콜리플라워)
    let d = 0, sum = 0;
    for (const [ox, oy, r] of L) {
      const dx = (x - ox), dy = (y - oy) / 0.92;
      const q = 1 - Math.sqrt(dx * dx + dy * dy) / r;
      if (q > d) d = q;
      if (q > -0.5) sum += Math.max(0, q + 0.5) * 0.15;
    }
    d = d * 1.1 + Math.min(0.35, sum);
    d -= 0.16 * (fbm(x * 9, y * 9, ns, 3) - 0.4);            // 가장자리 잔결
    d *= 1 - smooth01((y + 0.03) / 0.07);                     // 바닥: 부드럽게 평평
    field[gy * cols + gx] = d;
  }
  const at = (gx, gy) => field[clamp(gy, 0, rows - 1) * cols + clamp(gx, 0, cols - 1)];
  const sx = sv[0] / (bx1 - bx0) * cols, sy = sv[1] / (byB - byT) * rows;
  const out = new Uint8ClampedArray(cols * rows * 4);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const d = at(gx, gy);
    const alpha = smooth01((d - 0.3) / 0.1);
    if (alpha <= 0.004) continue;
    const yN = gy / rows;
    let light;
    if (!back) {
      // 해 쪽으로 세 번 걸어가며 밀도를 모은다(스스로 가림) → 덩이 사이 골·아래가 어둡다
      let occ = 0;
      for (let k = 1; k <= 4; k++) occ += Math.max(0, at(Math.round(gx + sx * 0.045 * k), Math.round(gy + sy * 0.045 * k)) - 0.3) * (1.25 - 0.2 * k);
      light = (0.3 + 0.7 * Math.exp(-1.3 * occ)) * (0.78 + 0.22 * (1 - yN));
    } else {
      light = clamp(1 - (d - 0.3) * 2.6, 0, 1) ** 2;         // 얇은 가장자리만 밝다
    }
    let col = back ? lerpC(lerpC(Sh, { r: 70, g: 82, b: 104 }, 0.5), { r: 255, g: 246, b: 224 }, clamp(light, 0, 1))
      : lerpC(lerpC(Sh, { r: 96, g: 110, b: 134 }, 0.4), C, clamp(light, 0, 1) ** 0.8);
    col = [col[0] + (SKY.r - col[0]) * haze, col[1] + (SKY.g - col[1]) * haze, col[2] + (SKY.b - col[2]) * haze];
    const o4 = (gy * cols + gx) * 4;
    out[o4] = col[0]; out[o4 + 1] = col[1]; out[o4 + 2] = col[2]; out[o4 + 3] = alpha * a0 * 255;
  }
  return out;
}

function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
