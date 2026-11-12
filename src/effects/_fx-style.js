// 손그림 VFX 공용 도구(R29) — docs/vfx-reference-guide.md 의 규칙을 코드로.
//   "AI/SVG 느낌"(고른 무작위·일정 속도·완벽한 원·2색 그라데이션)을 피하려고 효과들이 함께 쓴다.
//   전부 결정론: 무작위는 넘겨받은 rng 만 쓴다. DOM 없음. 캔버스는 borrow/release 로만.
import { clamp, withAlpha, mix, rgba } from './_fx-util.js';
import { blurToSmall } from '../core/render/blur.js';

// ── 분포 ────────────────────────────────────────────────
// 가우시안 근사(-1~1 부근, 가운데 몰림). 고른 rng() 대신 "뭉침"을 만들 때.
export const gauss = (rng) => (rng() + rng() + rng() - 1.5) / 1.5;

// 크기 3단계(지침 3-2): 큰 것 10% · 중간 30% · 작은 것 60%. 단계 안에서 ±15% 흔들기.
//   반환: { tier: 0(큰)|1(중간)|2(작은), k: 크기 배율(큰=1 기준) }
export const TIER_SCALE = [1, 0.45, 0.18];
export function sizeTier(rng, mix = [0.1, 0.3]) {
  const u = rng();
  const tier = u < mix[0] ? 0 : u < mix[0] + mix[1] ? 1 : 2;
  return { tier, k: TIER_SCALE[tier] * (0.85 + rng() * 0.3) };
}

// 무리 중심 n개 → 그 주변으로 뭉쳐 흩뿌린 0~1 좌표. 빈 공간(쉼표)이 생긴다.
export function makeClusters(rng, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: 0.1 + rng() * 0.8, y: 0.1 + rng() * 0.8, s: 0.12 + rng() * 0.16 });
  return out;
}
export function clusterPoint(rng, clusters, loose = 0.25) {
  if (rng() < loose) return { x: rng(), y: rng() }; // 일부는 흩어진 외톨이
  const c = clusters[Math.floor(rng() * clusters.length)];
  return { x: c.x + gauss(rng) * c.s, y: c.y + gauss(rng) * c.s };
}

// ── 시간 ────────────────────────────────────────────────
// 2s·3s 홀드(지침 3-5): n 프레임마다 그림 갱신. f=frameCount 는 0 과 같게 접어 루프 유지.
export function holdFrame(f, n, frameCount) {
  const fc = Math.max(1, frameCount | 0);
  const ff = ((f % fc) + fc) % fc;
  const k = Math.max(1, n | 0);
  return k <= 1 ? ff : Math.floor(ff / k) * k;
}
export const HOLD_PARAM = (def = 2) => ({
  key: 'hold', label: '그림 바꾸는 간격(프레임)', type: 'select', default: String(def),
  options: [{ value: '1', label: '매 프레임(부드럽게)' }, { value: '2', label: '2프레임(손그림)' }, { value: '3', label: '3프레임(더 거칠게)' }],
});

export const easeOut = (t, k = 2.5) => 1 - Math.pow(1 - clamp(t, 0, 1), k);
export const easeIn = (t, k = 2.5) => Math.pow(clamp(t, 0, 1), k);

// 비대칭 깜빡임: 빠르게 켜지고(attack) 천천히 꺼진다. t:0~1 한 주기 → 0~1.
export function flick(t, attack = 0.15) {
  const u = t - Math.floor(t);
  return u < attack ? easeOut(u / attack, 2) : 1 - easeIn((u - attack) / (1 - attack), 0.6);
}

// 한 번 재생 효과의 3구간(지침 3-5): 예비 10% → 정점 10% → 여운 80%.
//   반환 { phase: 'wind'|'hit'|'fall', u: 구간 안 0~1 }
export function onceSpan(t, wind = 0.1, hit = 0.1) {
  t = clamp(t, 0, 1);
  if (t < wind) return { phase: 'wind', u: t / wind };
  if (t < wind + hit) return { phase: 'hit', u: (t - wind) / hit };
  return { phase: 'fall', u: (t - wind - hit) / (1 - wind - hit) };
}

// ── 색 ──────────────────────────────────────────────────
// 계단식 색 램프(지침 3-4): stops = [[끝 t, 색], ...] 오름차순. 경계는 soft(0~1 비율) 폭만 부드럽게.
//   선형 그라데이션 대신 딱딱한 2~4단. alpha 는 전체 곱.
export function rampGradient(ctx, x0, y0, x1, y1, stops, alpha = 1, soft = 0.03) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  addRampStops(g, stops, alpha, soft);
  return g;
}
export function rampRadial(ctx, x, y, r0, r1, stops, alpha = 1, soft = 0.03) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(r0 + 0.01, r1));
  addRampStops(g, stops, alpha, soft);
  return g;
}
function addRampStops(g, stops, alpha, soft) {
  let prev = 0;
  for (let i = 0; i < stops.length; i++) {
    const [end, col, a = 1] = stops[i];
    const s = i === 0 ? 0 : Math.min(1, prev + soft);
    g.addColorStop(clamp(s, 0, 1), withAlpha(col, a * alpha));
    g.addColorStop(clamp(end, 0, 1), withAlpha(col, a * alpha));
    prev = end;
  }
}

// 두 색을 섞은 CSS 색 문자열(fillStyle 에 바로). _fx-util.mix 는 {r,g,b} 객체라 fillStyle 에 넣으면 무시된다.
export const mixCss = (c1, c2, t) => rgba(mix(c1, c2, t), 1);

// ── 형태 ────────────────────────────────────────────────
// 물방울: 둥근 머리(x,y, 반지름 r) + ang 방향으로 len 만큼 뾰족한 꼬리. bend: 꼬리 휘어짐(-1~1).
export function teardropPath(ctx, x, y, r, len, ang, bend = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const tx = x + ca * (r + len), ty = y + sa * (r + len);
  const nx = -sa, ny = ca;                    // 꼬리에 수직
  const bx = nx * bend * len * 0.5, by = ny * bend * len * 0.5;
  ctx.moveTo(x + nx * r, y + ny * r);
  // 뒤쪽 반원(꼬리 반대편)
  ctx.arc(x, y, r, ang + Math.PI / 2, ang - Math.PI / 2 + Math.PI * 2, false);
  // 위쪽 옆선 → 꼬리 끝 → 아래쪽 옆선
  ctx.quadraticCurveTo(x - nx * r * 0.9 + ca * len * 0.55 + bx, y - ny * r * 0.9 + sa * len * 0.55 + by, tx, ty);
  ctx.quadraticCurveTo(x + nx * r * 0.9 + ca * len * 0.55 + bx, y + ny * r * 0.9 + sa * len * 0.55 + by, x + nx * r, y + ny * r);
}

// 불규칙 덩어리: 반지름을 흔든 n개 꼭짓점을 이은 부드러운 닫힌 곡선. jit 은 미리 뽑은 0~1 배열(결정론).
export function blobPath(ctx, x, y, r, jit, amt = 0.3, rot = 0) {
  const n = jit.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * (1 - amt * 0.5 + jit[i] * amt);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const nm = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], nm[0], nm[1]);
  }
  ctx.closePath();
}
export const jitter = (rng, n) => Array.from({ length: n }, () => rng());

// 굵기가 변하는 선(thick & thin): pts=[[x,y]...] 를 따라 시작 w0 → 중간 wMax → 끝 w1 로 채운 띠.
export function taperPath(ctx, pts, w0, wMax, w1, peak = 0.35) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wv = t < peak ? w0 + (wMax - w0) * (t / peak) : wMax + (w1 - wMax) * ((t - peak) / (1 - peak));
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const hw = Math.max(0, wv) / 2;
    L.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]);
    R.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
}

// ── 촬영 처리 ───────────────────────────────────────────
// 디퓨전(지침 3-7): draw(c) 로 그린 것을 축소·흐림해 'lighter' 로 은은히 더한 뒤 원본을 얹는다.
//   ctx 와 같은 크기·같은 좌표계 임시 캔버스를 쓴다. amount 0 이면 바로 그린다(비용 없음).
//   rad 는 논리 px(scale 곱함). 두 겹(작고 강함 + 크고 약함)으로 투과광 느낌.
export function withDiffusion(ctx, env, amount, rad, draw) {
  const { borrow, release, scale = 1 } = env;
  if (!(amount > 0) || !ctx.canvas || !borrow) { draw(ctx); return; }
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const layer = borrow(cw, ch);
  const lc = layer.getContext('2d');
  lc.setTransform(ctx.getTransform());
  draw(lc);
  lc.setTransform(1, 0, 0, 1, 0, 0);
  const a = blurToSmall(layer, Math.max(1, rad * 0.4 * scale), borrow);
  const b = blurToSmall(layer, Math.max(1, rad * scale), borrow);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(amount, 0, 1);
  ctx.drawImage(a.canvas, 0, 0, a.sw, a.sh, 0, 0, cw, ch);
  ctx.globalAlpha = clamp(amount, 0, 1) * 0.6;
  ctx.drawImage(b.canvas, 0, 0, b.sw, b.sh, 0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  release(a.canvas); release(b.canvas); release(layer);
}
export const DIFFUSION_PARAM = (def = 0.5) => ({ key: 'diffusion', label: '빛 번짐', type: 'float', default: def, min: 0, max: 1, step: 0.05 });
