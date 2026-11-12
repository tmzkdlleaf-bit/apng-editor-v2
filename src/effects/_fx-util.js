// 효과 공용 헬퍼(효과가 아님 — registry 에 등록하지 않는다). 결정론 유지(Math.random 금지).
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const frac = (x) => x - Math.floor(x);
const fade = (t) => t * t * (3 - 2 * t);

// '#rgb' / '#rrggbb' → {r,g,b}. 실패 시 흰색.
export function parseColor(hex) {
  if (typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
  let s = hex.trim().replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function withAlpha(color, a) {
  const { r, g, b } = parseColor(color);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}
export function mix(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  return { r: Math.round(lerp(a.r, b.r, t)), g: Math.round(lerp(a.g, b.g, t)), b: Math.round(lerp(a.b, b.b, t)) };
}
export function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${clamp(a, 0, 1)})`; }

// 정수 해시 → [0,1)
export function hash2(x, y, seed = 0) {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 83492791)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// 매끄러운 2D 값 노이즈 (연기·안개·코스틱용). 결정론.
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed), v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed), v11 = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
}
// 옥타브 합산 노이즈
export function fbm(x, y, seed = 0, oct = 3) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) { sum += amp * valueNoise(x * freq, y * freq, seed + i * 101); amp *= 0.5; freq *= 2; }
  return sum;
}

// RGB 채널 분리(색수차·글리치 색 어긋남). src=소스 캔버스(물리px), pad=정렬 오프셋.
// R 채널을 (dxR,dyR), B 채널을 (dxB,dyB) 만큼 밀어 'lighter' 로 합친다. 풀 임시 캔버스 사용.
export function rgbSplit(ctx, src, pad, dxR, dyR, dxB, dyB, borrow, release) {
  const w = src.width, h = src.height;
  const tmp = borrow(w, h);
  const tc = tmp.getContext('2d');
  const chan = (mult, dx, dy) => {
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'source-over'; tc.globalAlpha = 1; tc.clearRect(0, 0, w, h);
    tc.drawImage(src, 0, 0);
    tc.globalCompositeOperation = 'multiply'; tc.fillStyle = mult; tc.fillRect(0, 0, w, h);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(src, 0, 0); // 소스 알파만 유지
    ctx.drawImage(tmp, pad + dx, pad + dy);
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  chan('#ff0000', dxR, dyR);
  chan('#00ff00', 0, 0);
  chan('#0000ff', dxB, dyB);
  ctx.restore();
  release(tmp);
}

// 칸 값 필드 그리기(R27) — cols×rows 칸마다 값을 정해 작은 캔버스(풀)에 한 번에 쓰고, 부드럽게 늘려
// (0,0)~(w,h)에 그린다. 칸마다 fillRect 로 겹쳐 칠하면 반투명 칸이 겹친 자리가 밝은 격자 줄이 됐다(안개·코스틱).
// cell(gx, gy) → [r, g, b, a(0~1)] 또는 null(투명). ctx 는 효과 좌표계(doc px) 그대로.
export function drawField(ctx, w, h, cols, rows, borrow, release, cell) {
  cols = Math.max(1, cols | 0); rows = Math.max(1, rows | 0);
  const tmp = borrow(cols, rows);
  const tc = tmp.getContext('2d');
  const img = tc.createImageData(cols, rows);
  const d = img.data;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const v = cell(gx, gy);
      if (!v) continue;
      const i = (gy * cols + gx) * 4;
      d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = Math.round(clamp(v[3], 0, 1) * 255);
    }
  }
  tc.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, cols, rows, 0, 0, w, h);
  ctx.restore();
  release(tmp);
}

// ── R28a 공용 ────────────────────────────────────────────────────────────

// 한 번(once)형 효과의 "진행 방식" 파라미터. 효과 params 에 ...PROGRESS_PARAMS 로 넣는다.
//   자동: 시작 프레임 + 길이 동안 0→1.  직접: '진행' 값(0~1)을 키프레임으로.
//   방향: 나타나기(0→1) / 사라지기(1→0, 진행을 뒤집음).  느리게 시작·끝: 기존 이징 이름.
export const PROGRESS_PARAMS = [
  { key: 'progMode', label: '진행 방식', type: 'select', default: 'auto',
    options: [{ value: 'auto', label: '자동(시작·길이)' }, { value: 'manual', label: '직접(진행 값 키)' }] },
  { key: 'progStart', label: '시작 프레임', type: 'int', default: 0, min: 0, max: 600 },
  { key: 'progLength', label: '길이(프레임)', type: 'int', default: 12, min: 1, max: 600 },
  { key: 'progress', label: '진행', type: 'float', default: 1, min: 0, max: 1, step: 0.01, animatable: true },
  { key: 'progDir', label: '방향', type: 'select', default: 'in',
    options: [{ value: 'in', label: '나타나기' }, { value: 'out', label: '사라지기' }] },
  { key: 'progEase', label: '느리게 시작·끝', type: 'select', default: 'easeInOut',
    options: [
      { value: 'linear', label: '일정하게' }, { value: 'easeIn', label: '천천히 시작' },
      { value: 'easeOut', label: '천천히 끝나며' }, { value: 'easeInOut', label: '부드럽게 시작·끝' },
      { value: 'easeOutCubic', label: '아주 천천히 끝나며' }, { value: 'easeOutBack', label: '튕기듯 끝나며' },
    ] },
];

// once 형 효과의 진행값 0~1(이징·방향 적용). f=현재 프레임.
export function progressOf(f, p, easeFn) {
  let t;
  if ((p.progMode ?? 'auto') === 'manual') t = clamp(p.progress ?? 1, 0, 1);
  else {
    const len = Math.max(1, Math.round(p.progLength ?? 12));
    t = clamp((f - Math.round(p.progStart ?? 0)) / len, 0, 1);
  }
  if (easeFn) t = easeFn(p.progEase ?? 'easeInOut', t);
  if ((p.progDir ?? 'in') === 'out') t = 1 - t;
  return t;
}

export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };

// 번지는 경계(잉크·불타기·성에): value(u,v)→0~1 이 level 보다 작은 곳을 채운다. soft 는 경계 부드러움.
//   cols×rows 작은 필드로 계산해 부드럽게 늘린다(drawField). 반환 없음 — ctx 에 color 로 그린다.
export function thresholdField(ctx, w, h, cols, rows, borrow, release, value, level, soft, color) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  drawField(ctx, w, h, cols, rows, borrow, release, (gx, gy) => {
    const v = value((gx + 0.5) / cols, (gy + 0.5) / rows);
    const a = 1 - smoothstep(level - soft, level + soft, v);
    return a > 0.003 ? [c.r, c.g, c.b, a] : null;
  });
}

// 가지 친 선(번개·혈관·금): 시작점에서 가지를 뻗은 선분 목록. 결정론(rng).
//   o = { x, y, angle(라디안), length, depth(가지 단계), spread(갈라지는 각도), branch(가지 칠 확률),
//         jag(꺾임 정도), segs(한 가지의 마디 수), shrink(가지 길이 줄어듦) }
//   반환: [{ x0,y0,x1,y1, t0,t1(시작점에서의 진행 0~1), level(0 줄기·1 가지…), w(굵기 비율 1→작게) }]
export function branchSegments(rng, o) {
  const out = [];
  const segs = Math.max(2, o.segs ?? 8);
  const total = o.length ?? 100;
  function grow(x, y, ang, len, level, tStart, tSpan, w) {
    const step = len / segs;
    let cx = x, cy = y, a = ang;
    for (let i = 0; i < segs; i++) {
      a += (rng() - 0.5) * (o.jag ?? 0.6);
      const nx = cx + Math.cos(a) * step, ny = cy + Math.sin(a) * step;
      const t0 = tStart + tSpan * (i / segs), t1 = tStart + tSpan * ((i + 1) / segs);
      const ww = w * (1 - 0.7 * (i / segs));
      out.push({ x0: cx, y0: cy, x1: nx, y1: ny, t0, t1, level, w: ww });
      if (level < (o.depth ?? 2) && rng() < (o.branch ?? 0.3)) {
        const side = rng() < 0.5 ? -1 : 1;
        grow(nx, ny, a + side * (o.spread ?? 0.6) * (0.5 + rng()), len * (o.shrink ?? 0.55), level + 1,
          t1, tSpan * (o.shrink ?? 0.55), ww * 0.6);
      }
      cx = nx; cy = ny;
    }
  }
  grow(o.x ?? 0, o.y ?? 0, o.angle ?? 0, total, 0, 0, 1, 1);
  // 가지 끝이 1 을 넘을 수 있으니 전체를 0~1 로 맞춘다(진행 1 = 다 자람).
  let maxT = 0; for (const s of out) if (s.t1 > maxT) maxT = s.t1;
  if (maxT > 0) for (const s of out) { s.t0 /= maxT; s.t1 /= maxT; }
  return out;
}

// 가지 선 그리기: progress(0~1)까지 자란 부분만. width = 줄기 굵기(doc px).
//   선분을 굵기 단계(10단계)로 묶어 단계마다 한 번에 그린다(선분마다 그리면 수백 번 그려 느렸다).
export function drawSegments(ctx, segsList, progress, width, color, glow = 0) {
  const buckets = new Map();
  for (const s of segsList) {
    if (s.t0 >= progress) continue;
    const k = s.t1 <= progress ? 1 : (progress - s.t0) / (s.t1 - s.t0);
    const key = Math.max(1, Math.round(s.w * 10));
    let path = buckets.get(key);
    if (!path) { path = []; buckets.set(key, path); }
    path.push(s.x0, s.y0, s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k);
  }
  if (!buckets.size) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  const baseAlpha = ctx.globalAlpha;
  const stroke = (lw, alpha) => {
    for (const [key, pts] of buckets) {
      ctx.lineWidth = Math.max(0.5, lw * key / 10);
      ctx.globalAlpha = baseAlpha * alpha;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 4) { ctx.moveTo(pts[i], pts[i + 1]); ctx.lineTo(pts[i + 2], pts[i + 3]); }
      ctx.stroke();
    }
  };
  if (glow > 0) stroke(width * 2.4, 0.3 * glow);
  stroke(width, 1);
  ctx.restore();
}
