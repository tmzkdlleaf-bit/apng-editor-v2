// 실사 VFX 공용 도구(R30) — docs/vfx-guide-real.md 의 세 기둥을 코드로.
//   기둥 A 물리: 실제 크기(m)·실제 시간(초) → 화면 px·프레임 (world)
//   기둥 B 게임 구조: 상태 없는 결정론 이미터(emit) + 닫힌 식 운동(integrate) + 수명 곡선(overLife)
//   기둥 C 촬영: 셔터 흐림(streak) · 빛 번짐 + 입자감(camera)
// 전부 결정론: 입자 성질은 hash(입자 번호, 세대, 시드)로만 뽑는다(rng 소비 순서에 기대지 않음). DOM 없음.
import { clamp, hash2 } from './_fx-util.js';
import { loopNoise, loopFbm } from './_fx-style.js';
import { blurToSmall } from '../core/render/blur.js';

// ── 기둥 A: 장면 크기·시간 ──────────────────────────────
export const WORLD_PARAMS = [
  { key: 'worldHeight', label: '화면 높이(실제 m)', type: 'float', default: 3, min: 0.2, max: 60, step: 0.1, advanced: true },
  { key: 'shutter', label: '셔터 각도(움직임 흐림)', type: 'int', default: 180, min: 0, max: 360, advanced: true },
  { key: 'bloom', label: '빛 번짐', type: 'float', default: 0.35, min: 0, max: 1, step: 0.05, advanced: true },
  { key: 'grain', label: '입자감(그레인)', type: 'float', default: 0.1, min: 0, max: 1, step: 0.05, advanced: true },
];

// 실제 단위 → 화면. pxPerM: 1 m 가 몇 px, dt: 한 프레임 초, blurK: 셔터 열린 비율(180° = 0.5),
//   L: 루프 전체 길이(초), t: 지금 시각(초, 0~L).
export function world(env, p, defHeight = 3) {
  const fps = Math.max(1, env.fps || 12);
  const fc = Math.max(1, env.frameCount || 1);
  const dt = 1 / fps;
  const f = ((env.f % fc) + fc) % fc;
  return {
    pxPerM: env.h / Math.max(0.05, p.worldHeight ?? defHeight),
    dt, fps, L: fc * dt, t: f * dt,
    blurK: clamp((p.shutter ?? 180) / 360, 0, 1),
  };
}

// 실제 주기(초)를 루프 길이에 맞는 "루프 ÷ 정수"로 맞춘다(지침 5-1). 반환: 루프 안 반복 횟수(≥1).
export function cyclesInLoop(periodSec, L) {
  return Math.max(1, Math.round(L / Math.max(1e-3, periodSec)));
}

// ── 기둥 B: 결정론 이미터 ───────────────────────────────
// 입자 슬롯 i 마다 수명 life(초)·루프 안 재탄생 횟수 m 을 정한다. 슬롯은 L/m 초마다 다시 태어난다.
//   수명이 재탄생 간격보다 길면(루프가 짧을 때) 앞 세대도 함께 그려 끊김이 없다.
//   cb(i, age, u, R) — age: 나이(초), u: 수명 비율 0~1, R(k): 이 입자·이 세대의 고정 난수 0~1.
//   spec: { count, life:[min,max], gap: 쉬는 비율(0~), seed }
export function emit(spec, t, L, cb) {
  const n = Math.max(0, spec.count | 0);
  const seed = spec.seed | 0;
  const [l0, l1] = spec.life;
  const gap = Math.max(0, spec.gap ?? 0);
  for (let i = 0; i < n; i++) {
    const life = l0 + (l1 - l0) * hash2(i, 1, seed);
    const m = Math.max(1, Math.floor(L / (life * (1 + gap))));
    const period = L / m;
    const ph = hash2(i, 2, seed) * period;      // 슬롯마다 시작을 흩뜨림
    const tt = t + ph;
    const g0 = Math.floor(tt / period);
    const age0 = tt - g0 * period;
    for (let back = 0; age0 + back * period < life; back++) {
      const age = age0 + back * period;
      const gen = (((g0 - back) % m) + m) % m;   // 세대 번호 — 루프 한 바퀴 뒤 같은 번호(이음매 없음)
      const R = (k) => hash2(i * 977 + gen * 131 + 7, k + 11, seed);
      cb(i, age, age / life, R, life);
      if (back > 8) break;
    }
  }
}

// 닫힌 식 운동: 처음 위치 x0,y0(m) · 속도 vx,vy(m/s) · 가속 ax,ay(m/s², 중력·부력) · 저항 k(1/s).
//   저항이 있으면 속도가 종단 속도 a/k 로 지수 수렴. t 초 뒤 { x, y, vx, vy }.
export function integrate(x0, y0, vx, vy, ax, ay, k, t) {
  if (!(k > 1e-6)) {
    return { x: x0 + vx * t + 0.5 * ax * t * t, y: y0 + vy * t + 0.5 * ay * t * t, vx: vx + ax * t, vy: vy + ay * t };
  }
  const e = Math.exp(-k * t);
  const tx = ax / k, ty = ay / k;                 // 종단 속도
  return {
    x: x0 + tx * t + (vx - tx) * (1 - e) / k,
    y: y0 + ty * t + (vy - ty) * (1 - e) / k,
    vx: tx + (vx - tx) * e,
    vy: ty + (vy - ty) * e,
  };
}

// 수명 곡선: pts = [[u, v], ...] (u 오름차순). 사이는 부드럽게(smoothstep) 잇는다.
export function overLife(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [u0, v0] = pts[i - 1], [u1, v1] = pts[i];
      let k = (u - u0) / Math.max(1e-6, u1 - u0);
      k = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * k;
    }
  }
  return pts[pts.length - 1][1];
}

// 온도(K) → 색 [r,g,b] 0~255 와 밝기(0~1). 흑체 복사 근사(Tanner Helland 식, 1000~40000 K),
//   1000 K 아래는 어두운 빨강으로 줄여 간다(자료집 2-1: 약 850 K 어두운 빨강부터 보임).
export function blackbody(T) {
  const k = clamp(T, 1000, 40000) / 100;
  let r, g, b;
  r = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  g = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  b = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  const c = (v) => clamp(Math.round(v), 0, 255);
  // 밝기: 온도가 낮을수록 훨씬 어둡다(복사량 ∝ T^4 를 보기 좋게 줄인 근사)
  const lum = clamp(Math.pow(Math.max(0, T - 700) / 1100, 1.6), 0, 1);
  return { rgb: [c(r), c(g), c(b)], lum };
}
export const rgbStr = (rgb, a = 1) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${clamp(a, 0, 1)})`;

// 조리개 날 수 → 빛줄기 갈래 수(자료집 2-9): 짝수 n → n, 홀수 n → 2n, 0(둥근 조리개) → 0.
export const spikeCount = (n) => (n <= 0 ? 0 : n % 2 ? n * 2 : n);

// ── 기둥 C: 촬영 ────────────────────────────────────────
// 셔터 흐림 선: 지금 위치(x,y px)와 속도(vx,vy px/s). 길이 = 속도 × dt × blurK.
//   길이가 굵기보다 짧으면 점. 앞(지금 위치)이 진하고 꼬리가 옅다(두 겹 선).
export function streak(ctx, x, y, vx, vy, W, wd, col, a) {
  const L = Math.hypot(vx, vy) * W.dt * W.blurK;
  if (L < wd * 0.8) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, wd / 2, 0, Math.PI * 2); ctx.fill();
    return L;
  }
  const s = W.dt * W.blurK;
  const x0 = x - vx * s, y0 = y - vy * s;
  ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = wd;
  // 셔터 동안 쌓인 빛: 길수록 단위 길이당 밝기가 낮아진다(같은 빛이 넓게 퍼짐)
  const spread = clamp(Math.sqrt(wd * 4 / L), 0.3, 1);
  ctx.globalAlpha = a * spread * 0.6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
  ctx.globalAlpha = a * Math.min(1, spread * 1.2);
  ctx.beginPath(); ctx.moveTo(x - vx * s * 0.3, y - vy * s * 0.3); ctx.lineTo(x, y); ctx.stroke();
  return L;
}

// 촬영 마무리: draw(c) 로 그린 것에 입자감(그레인)을 얹고(효과 안쪽에만), 빛 번짐을 은은히 더한다.
//   bloom: 문턱 없이 밝기 비례(더하기 합성은 밝은 곳이 더 번진다). grain: 프레임마다 다른 점(루프 안 정수 프레임 → 이음매 없음).
export function camera(ctx, env, p, draw, opt = {}) {
  const bloom = clamp(p.bloom ?? 0.35, 0, 1) * (opt.bloomK ?? 1);
  const grain = clamp(p.grain ?? 0.1, 0, 1) * (opt.grainK ?? 1);
  const { borrow, release, scale = 1 } = env;
  if ((!(bloom > 0) && !(grain > 0)) || !ctx.canvas || !borrow) { draw(ctx); return; }
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const layer = borrow(cw, ch);
  const lc = layer.getContext('2d');
  lc.setTransform(ctx.getTransform());
  draw(lc);
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
  if (grain > 0) applyGrain(lc, cw, ch, env, grain, borrow, release);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bloom > 0) {
    const qw = Math.max(1, Math.ceil(cw / 4)), qh = Math.max(1, Math.ceil(ch / 4));
    const q = borrow(qw, qh);
    const qc = q.getContext('2d');
    qc.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in qc) qc.imageSmoothingQuality = 'low';
    qc.drawImage(layer, 0, 0, cw, ch, 0, 0, cw / 4, ch / 4);
    const rad = (opt.bloomRad ?? Math.max(env.w, env.h) * 0.04) * scale / 4;
    const a = blurToSmall(q, Math.max(1, rad * 0.35), borrow);
    const b = blurToSmall(q, Math.max(1, rad), borrow);
    qc.clearRect(0, 0, qw, qh);
    qc.globalCompositeOperation = 'lighter';
    qc.globalAlpha = 0.6; qc.drawImage(a.canvas, 0, 0, a.sw, a.sh, 0, 0, qw, qh);
    qc.globalAlpha = 0.5; qc.drawImage(b.canvas, 0, 0, b.sw, b.sh, 0, 0, qw, qh);
    qc.globalAlpha = 1; qc.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = bloom;
    ctx.drawImage(q, 0, 0, qw, qh, 0, 0, qw * 4, qh * 4);
    release(a.canvas); release(b.canvas); release(q);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  release(layer);
}

// 입자감: 프레임마다 다른 128×128 점 무늬 한 장을 2배로 늘려 타일처럼 깔고, 효과 안쪽에만(source-atop) 얹는다.
//   어두운 점 위주(밝은 곳은 덜 보임). 매 프레임 전체 화면 크기로 만들지 않아 빠르다.
const GT = 128;
function applyGrain(lc, cw, ch, env, amt, borrow, release) {
  const g = borrow(GT, GT);
  const gc = g.getContext('2d');
  const img = gc.createImageData(GT, GT);
  const d = img.data;
  const fc = Math.max(1, env.frameCount || 1);
  const fr = ((env.f % fc) + fc) % fc;
  for (let y = 0, o = 0; y < GT; y++) {
    for (let x = 0; x < GT; x++, o += 4) {
      const v = hash2(x, y, fr * 7919 + 13) - 0.5;
      const c = v < 0 ? 0 : 255;
      d[o] = d[o + 1] = d[o + 2] = c;
      d[o + 3] = Math.abs(v) * 2 * 255 * (v < 0 ? 1 : 0.55);
    }
  }
  gc.putImageData(img, 0, 0);
  lc.save();
  lc.globalCompositeOperation = 'source-atop';
  lc.globalAlpha = amt * 0.22;
  lc.imageSmoothingEnabled = false;
  const T2 = GT * 2;
  // 타일 경계가 줄지어 보이지 않게 줄마다 반 칸씩 어긋나게 깐다
  for (let ty = 0, row = 0; ty < ch; ty += T2, row++) {
    for (let tx = -((row % 2) * GT); tx < cw; tx += T2) lc.drawImage(g, 0, 0, GT, GT, tx, ty, T2, T2);
  }
  lc.restore();
  release(g);
}

// ── R31: 실제 사진 측정 기반 도구(docs/vfx-research-2.md) ───────────────────────

// 불 사진 10장의 밝기 칸별 평균 색(검은 배경 위, 0~255). v=0 어두움 → v=1 가장 밝음.
//   R 이 먼저 꽉 차고 G 가 천천히, B 는 작지만 0 이 아니다. 가장 밝아도 순백이 아니라 크림색.
export const FIRE_PHOTO = [
  [0, 0, 0, 0], [0.12, 70, 18, 4], [0.22, 115, 32, 7], [0.34, 165, 58, 15], [0.46, 208, 90, 25],
  [0.58, 235, 125, 43], [0.7, 250, 165, 68], [0.82, 253, 207, 100], [0.94, 253, 240, 168], [1, 255, 248, 214],
];
// 검은 배경 사진 색 → 투명 배경용(언멀트): 가장 밝은 채널을 불투명도로, 색은 그만큼 나눠 되살린다.
export function unmultPx(r, g, b) {
  const m = Math.max(r, g, b);
  if (m <= 0) return [0, 0, 0, 0];
  const k = 255 / m;
  return [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), m / 255];
}
function rampAt(tbl, v) {
  v = clamp(v, 0, 1);
  let i = 1; while (i < tbl.length - 1 && tbl[i][0] < v) i++;
  const a = tbl[i - 1], b = tbl[i], t = (v - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}
// 밝기 위치 v(0~1) → [r,g,b,a](투명 배경용). 256칸 표로 미리 만들어 둔다.
const _FIRE_LUT = Array.from({ length: 256 }, (_, i) => { const c = rampAt(FIRE_PHOTO, i / 255); return unmultPx(c[0], c[1], c[2]).map((x, j) => (j < 3 ? Math.round(x) : x)); });
export const firePhoto = (v) => _FIRE_LUT[Math.round(clamp(v, 0, 1) * 255)];
// 온도(K) → 사진 기준 불 색. 약 850 K 어두운 빨강 ~ 2100 K 크림빛 흰색.
export const fireTemp = (T, exposure = 1) => firePhoto(Math.pow(clamp((T - 850) / 1250, 0, 1), 0.85) * exposure);

// 침식(현업 'erosion'): 값이 문턱을 넘는 좁은 폭(soft) 안에서만 0→1. 불은 좁게(단단), 연기는 넓게(부드럽게).
export function erode(v, thr, soft) {
  const t = clamp((v - thr) / Math.max(1e-6, soft), 0, 1);
  return t * t * (3 - 2 * t);
}
// 능선 노이즈: 0.5 근처가 가장 밝은 가는 선 → 불 띠의 접힘선, 연기의 실 같은 결.
export const ridge = (n) => 1 - Math.abs(2 * n - 1);

// 흐르는 노이즈 침식 마스크(현업 '모양 × 흐르는 노이즈 2겹 → 침식'): 그린 덩어리를 이것으로 갉아
//   솜뭉치 대신 실 같은 결·찢긴 가장자리를 만든다. 반환 캔버스는 호출한 쪽이 release 한다.
//   o: { cell(작은 칸 px), freq, thr, soft, fil(능선 비중), flow(위상: 루프 끝에서 정수), drift(위상 한 번에 흐르는 양), seed, warp }
export function erodeMask(env, w, h, o) {
  const { borrow, scale = 1 } = env;
  const cs = Math.max(2, o.cell ?? 4);
  const cols = Math.max(8, Math.min(220, Math.round((w * scale) / cs)));
  const rows = Math.max(8, Math.min(220, Math.round((h * scale) / cs)));
  const cv = borrow(cols, rows);
  const cx = cv.getContext('2d');
  const img = cx.createImageData(cols, rows);
  const d = img.data;
  const fq = o.freq ?? 4, fl = o.flow ?? 0, sd = o.seed ?? 0, wp = o.warp ?? 0.6;
  const thr = o.thr ?? 0.4, soft = o.soft ?? 0.3, fil = o.fil ?? 0.3;
  const asp = w / Math.max(w, h), asp2 = h / Math.max(w, h);
  // 흐름 지도식 반복: 두 위상(반 주기 어긋남)을 번갈아 섞는다 — 위상이 정수 번 돌면 0프레임 = N프레임.
  const dr = o.drift ?? 0.6;
  const ph0 = fl - Math.floor(fl), ph1 = (fl + 0.5) - Math.floor(fl + 0.5);
  const w0 = 1 - Math.abs(1 - 2 * ph0), w1 = 1 - w0;
  const val = (u, v, off) => {
    const vv = v + off;
    const wx = loopNoise(u * 0.5, vv * 0.5, 0, 0, sd + 3) - 0.5;
    const n = loopFbm(u + wx * wp * 3, vv, 0, 0, sd, 3);
    const r = Math.pow(ridge(loopNoise(u * 1.7 + wx * 2, vv * 1.7, 0, 0, sd + 9)), 5);
    return clamp(erode(n, thr, soft) + fil * r, 0, 1);
  };
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const u = (gx / cols) * fq * asp, v = (gy / rows) * fq * asp2;
      const a = w0 * val(u, v, ph0 * dr) + w1 * val(u + 17.3, v, ph1 * dr);
      d[(gy * cols + gx) * 4 + 3] = Math.round(a * 255);
    }
  }
  cx.putImageData(img, 0, 0);
  return cv;
}
