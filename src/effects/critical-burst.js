// 크리티컬 금빛 폭발(R28d) — 다이스 컷인용. 번쩍(흰 화면) → 빛줄기 → 금가루·불티 → 고리 퍼짐 → 잔광.
//   소스 없이도 쓴다(소스가 있으면 번쩍 순간 그 그림을 밝게). 한 번형. 펌블용 붉은 프리셋.
import { TAU, clamp, parseColor, rgba, hash2, smoothstep, PROGRESS_PARAMS, progressOf } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world, integrate, overLife, streak, camera, spikeCount, WORLD_PARAMS } from './_fx-real.js';

const bump = (t, a, b, c) => (t <= a || t >= c) ? 0 : t < b ? (t - a) / (b - a) : 1 - (t - b) / (c - b);

export default {
  id: 'critical-burst',
  name: '크리티컬 금빛 폭발',
  category: '전환',
  once: true,
  description: '가운데서 금빛이 터진다(번쩍·빛줄기·금가루·고리·잔광). 다이스 크리티컬·펌블 컷인용, 소스 없이도',
  thumbnail: { frame: 5, bg: '#120e08' },
  bleed: 0,
  params: [
    { key: 'center', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'color', label: '색', type: 'color', default: '#ffcc4d' },
    { key: 'color2', label: '밝은 색', type: 'color', default: '#fff4c9' },
    { key: 'rays', label: '빛줄기 수', type: 'int', default: 16, min: 0, max: 48 },
    { key: 'dust', label: '가루 양', type: 'int', default: 120, min: 0, max: 400 },
    { key: 'rings', label: '고리 수', type: 'int', default: 2, min: 0, max: 5 },
    { key: 'flash', label: '번쩍 세기', type: 'float', default: 0.85, min: 0, max: 1, step: 0.05 },
    { key: 'intensity', label: '전체 세기', type: 'float', default: 1, min: 0, max: 1.5, step: 0.05 },
    LOOK_PARAM('real'),
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.6 } : q)),
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 20 } : d.key === 'progEase' ? { ...d, default: 'linear' } : d),
  ],
  presets: [
    { id: 'critical', label: '크리티컬(금빛)', values: { color: '#ffcc4d', color2: '#fff4c9' } },
    { id: 'fumble', label: '펌블(붉은빛)', values: { color: '#d8262b', color2: '#ffb3a8', rays: 10 } },
    { id: 'magic', label: '마법(푸른빛)', values: { color: '#4da3ff', color2: '#d9f0ff' } },
  ],
  scopes: ['full', 'box'],
  sources: [{ key: 'below', label: '밝게 할 그림(선택)' }],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, w, h, rng, sources, pad = 0 } = env;
    const t = progressOf(f, p, ease);
    if (t <= 0 || t >= 1) return;   // 시작 전·끝난 뒤에는 아무것도 없음
    const seed = 1 + Math.floor(rng() * 9999);
    const c1 = parseColor(p.color ?? '#ffcc4d'), c2 = parseColor(p.color2 ?? '#fff4c9');
    const K = clamp(p.intensity ?? 1, 0, 1.5);
    const cx = clamp(p.center?.x ?? 0.5, 0, 1) * w, cy = clamp(p.center?.y ?? 0.5, 0, 1) * h;
    const R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 잔광(가운데 둥근 빛) 0.05~1
    const glow = bump(t, 0.02, 0.15, 1) * K;
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.35 + 0.25 * t));
      g.addColorStop(0, rgba(c2, 0.9 * glow)); g.addColorStop(0.35, rgba(c1, 0.45 * glow)); g.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // 빛줄기 0.04~0.65 — 천천히 돌며 길어졌다 짧아짐
    const nr = Math.max(0, Math.round(p.rays ?? 16));
    const rk = bump(t, 0.04, 0.18, 0.65) * K;
    if (nr && rk > 0) {
      for (let i = 0; i < nr; i++) {
        const a = (i / nr) * TAU + t * 0.6 + (hash2(i, 1, seed) - 0.5) * 0.25;
        const len = R * (0.5 + 0.7 * hash2(i, 2, seed)) * (0.4 + 0.6 * smoothstep(0.04, 0.3, t));
        const wd = 0.035 + 0.05 * hash2(i, 3, seed);
        const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        g.addColorStop(0, rgba(c2, 0.85 * rk)); g.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a - wd) * len, cy + Math.sin(a - wd) * len);
        ctx.lineTo(cx + Math.cos(a + wd) * len, cy + Math.sin(a + wd) * len);
        ctx.closePath(); ctx.fill();
      }
    }
    // 고리 0.08~0.75 — 차례로 퍼짐
    const nrings = Math.max(0, Math.round(p.rings ?? 2));
    for (let k = 0; k < nrings; k++) {
      const t0 = 0.08 + k * 0.1, t1 = t0 + 0.55;
      if (t < t0 || t > t1) continue;
      const u = (t - t0) / (t1 - t0);
      ctx.strokeStyle = rgba(k % 2 ? c1 : c2, (1 - u) * 0.9 * K);
      ctx.lineWidth = Math.max(1, (1 - u) * Math.min(w, h) * 0.025);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.75 * (1 - Math.pow(1 - u, 2.2)), 0, TAU); ctx.stroke();
    }
    // 금가루·불티 0.06~1 — 사방으로 튀었다가 떨어지며 사라짐
    const nd = Math.max(0, Math.round(p.dust ?? 120));
    for (let i = 0; i < nd; i++) {
      const st = 0.06 + 0.12 * hash2(i, 4, seed);
      if (t < st) continue;
      const u = (t - st) / (1 - st);
      const a = hash2(i, 5, seed) * TAU, sp = (0.25 + 0.75 * hash2(i, 6, seed)) * R * 0.9;
      const dd = sp * (1 - Math.pow(1 - u, 2.5));
      const x = cx + Math.cos(a) * dd, y = cy + Math.sin(a) * dd + u * u * h * 0.18;
      const life = 1 - u;
      const sz = (0.8 + 2.2 * hash2(i, 7, seed)) * (0.4 + 0.6 * life);
      const tw = 0.6 + 0.4 * Math.sin(u * 30 + i);
      ctx.fillStyle = rgba(hash2(i, 8, seed) < 0.4 ? c2 : c1, life * tw * K);
      if (hash2(i, 9, seed) < 0.25) { // 반짝이 십자
        ctx.fillRect(x - sz * 2.5, y - sz * 0.3, sz * 5, sz * 0.6); ctx.fillRect(x - sz * 0.3, y - sz * 2.5, sz * 0.6, sz * 5);
      } else { ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    // 번쩍 0~0.12 — 화면 전체(소스가 있으면 그 그림도 밝게)
    const fl = bump(t, 0, 0.03, 0.14) * clamp(p.flash ?? 0.85, 0, 1) * Math.min(1, K);
    if (fl > 0) {
      const src = (sources || []).find((s) => s.key === 'below')?.canvas;
      if (src) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl; ctx.drawImage(src, pad, pad); ctx.restore(); }
      ctx.fillStyle = rgba(c2, fl);
      ctx.fillRect(0, 0, w, h);
    }
  },
};

// R30 실사(지침 4-1 폭발류·자료집 2-4, 2-2, 2-9): 순서와 길이를 실제처럼 —
//   ① 번쩍: 한순간(노출 적분, 수십 ms) ② 불덩이·빛: 빠르게 커졌다 지수로 식음(약 0.3초)
//   ③ 충격 고리: 반지름 ∝ 시간^0.4(처음 빠르고 곧 느려짐), 얇고 옅게 ④ 불꽃 파편: 사방으로 튀어 공기 저항·중력, 식으며 색 변화, 셔터 흐림
//   ⑤ 빛줄기: 쐐기 대신 렌즈 빛 갈래(6갈래, 밝을 때만 길게). 여운(②의 잔광·파편)이 전체의 대부분.
function renderReal(ctx, env, p) {
  const { f, w, h, rng, sources, pad = 0 } = env;
  const t = progressOf(f, p, ease);
  if (t <= 0 || t >= 1) return;
  const W = world(env, p);
  const T = Math.max(W.dt, (p.progLength ?? 20) * W.dt);    // 효과 전체 길이(초)
  const age = Math.max(0, t * T - W.dt);                  // 처음 보이는 프레임 = 터지는 순간
  const seed = 1 + Math.floor(rng() * 9999);
  const c1 = parseColor(p.color ?? '#ffcc4d'), c2 = parseColor(p.color2 ?? '#fff4c9');
  const K = clamp(p.intensity ?? 1, 0, 1.5);
  const cx = clamp(p.center?.x ?? 0.5, 0, 1) * w, cy = clamp(p.center?.y ?? 0.5, 0, 1) * h;
  const R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  const S = Math.max(0.001, W.dt * W.blurK);
  const expo = (tau) => { const a = Math.max(0, age), b = age + S; return tau * (Math.exp(-a / tau) - Math.exp(-b / tau)) / Math.min(S, tau); };
  const flash = Math.min(1, expo(0.03)) * clamp(p.flash ?? 0.85, 0, 1) * Math.min(1, K);
  const glow = Math.min(1, expo(0.3) * 0.9 + expo(1.2) * 0.25) * K;    // 불덩이 빛 + 긴 잔광
  camera(ctx, env, p, (c) => {
    c.save();
    c.globalCompositeOperation = 'lighter';
    if (glow > 0.005) {
      const gr = R * (0.15 + 0.35 * Math.pow(Math.min(1, age / 0.5), 0.4));
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, gr);
      g.addColorStop(0, rgba(c2, 0.95 * glow)); g.addColorStop(0.25, rgba(c1, 0.55 * glow)); g.addColorStop(1, rgba(c1, 0));
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, gr, 0, TAU); c.fill();
      // 렌즈 빛 갈래: 밝을 때만, 밝기의 제곱근만큼 길게
      const nr = Math.max(0, Math.round(p.rays ?? 16)) > 0 ? spikeCount(6) : 0;
      for (let i = 0; i < nr; i++) {
        const a = -Math.PI / 2 + 0.26 + (i / nr) * TAU;
        const L = R * 0.9 * Math.sqrt(glow);
        const lg = c.createLinearGradient(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
        lg.addColorStop(0, rgba(c2, 0.8 * glow)); lg.addColorStop(0.3, rgba(c1, 0.25 * glow)); lg.addColorStop(1, rgba(c1, 0));
        c.strokeStyle = lg; c.lineWidth = Math.max(1, Math.min(w, h) * 0.006);
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); c.stroke();
      }
    }
    // 충격 고리(얇고 옅게, 처음 빠르고 곧 느려짐)
    const nrings = Math.max(0, Math.round(p.rings ?? 2));
    for (let k = 0; k < nrings; k++) {
      const t0 = k * 0.06, ra = age - t0;
      if (ra <= 0) continue;
      const u = ra / (T * 0.8);
      if (u >= 1) continue;
      const rr = R * 0.85 * Math.pow(u, 0.4);
      c.strokeStyle = rgba(k % 2 ? c1 : c2, 0.45 * Math.pow(1 - u, 1.8) * K);
      c.lineWidth = Math.max(1, Math.min(w, h) * 0.012 * (1 - u * 0.6));
      c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.stroke();
    }
    // 불꽃 파편: 튀어나가 저항으로 멈추고 중력으로 처지며 식는다(흰 → 색)
    const nd = Math.max(0, Math.round(p.dust ?? 120));
    const v0 = R * 2.4;                                      // px/s (저항 3/s → 최대 거리 약 0.8R)
    for (let i = 0; i < nd; i++) {
      const st = 0.02 * hash2(i, 4, seed);
      const a2 = age - st;
      if (a2 <= 0) continue;
      const life = T * (0.5 + 0.5 * hash2(i, 10, seed));
      const u = a2 / life;
      if (u >= 1) continue;
      const ang = hash2(i, 5, seed) * TAU, sp = v0 * (0.3 + 0.7 * hash2(i, 6, seed));
      const m = integrate(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, R * 0.9, 3, a2);
      const col = u < 0.15 ? c2 : c1;
      const a = K * overLife([[0, 1], [0.6, 0.8], [1, 0]], u) * (hash2(i, 11, seed) < 0.3 && u > 0.5 ? 0.6 + 0.4 * Math.sin(a2 * 40 + i) : 1);
      streak(c, m.x, m.y, m.vx, m.vy, W, Math.max(0.8, (0.8 + 1.6 * hash2(i, 7, seed)) * (1 - u * 0.5)), rgba(col, 1), a);
    }
    c.restore();
    if (flash > 0.003) {
      const src = (sources || []).find((s) => s.key === 'below')?.canvas;
      if (src) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = flash; c.drawImage(src, pad, pad); c.restore(); }
      c.fillStyle = rgba(c2, flash); c.fillRect(0, 0, w, h);
    }
  }, { bloomK: 1 });
}
