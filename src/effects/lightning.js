// 번개(R28e) — 갈라지는 번갯불 + 화면 번쩍. 한 번 재생에 몇 번 치는지(정수) — 같은 순서로 반복(루프).
import { clamp, parseColor, rgba, hash2, branchSegments, drawSegments } from './_fx-util.js';
import { createRng } from '../core/render/rng.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world, camera, WORLD_PARAMS } from './_fx-real.js';

// R30 실사(docs/vfx-guide-real.md 4-1 번개, 자료집 2-8): 한 번 칠 때 같은 줄기가 2~4번 다시 번쩍인다.
//   뇌격 사이 40~80 ms, 첫 번째가 가장 밝고 뒤로 갈수록 약해진다. 뇌격마다 빛은 짧게 타오르고(약 25 ms)
//   이어지는 약한 전류가 잔광을 남긴다. 각 프레임의 밝기 = 셔터가 열린 동안 들어온 빛의 양(노출 적분).
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const seed = 1 + Math.floor(rng() * 9999);
  const n = Math.max(1, Math.round(p.strikes ?? 2));
  const col = parseColor(p.color ?? '#d9e6ff');
  const area = clamp(p.area ?? 0.8, 0.1, 1);
  const wd = Math.max(0.5, p.width ?? 3);
  const shutterT = Math.max(0.001, W.dt * W.blurK);
  const tau = 0.025, tauGlow = 0.12;
  // 셔터 [t0, t0+S] 동안 지수 감쇠 빛 exp(-(t-ts)/τ) 를 모은 양(뇌격 하나가 셔터 안에 다 들어오면 1)
  const expose = (ts, t0, S, tt) => {
    const a = Math.max(0, t0 - ts), b = t0 + S - ts;
    if (b <= 0) return 0;
    return tt * (Math.exp(-a / tt) - Math.exp(-b / tt)) / Math.min(S, tt);
  };
  let flash = 0;
  const draws = [];
  for (let k = 0; k < n; k++) {
    const t0 = (k + 0.15 + 0.6 * hash2(k, 1, seed)) * W.L / n;   // 첫 뇌격 시각(초)
    const strokes = Math.max(1, Math.min(6, Math.round((p.restrike ?? 3) + (hash2(k, 9, seed) - 0.5) * 1.5)));
    let B = 0, ts = t0;
    for (let j = 0; j < strokes; j++) {
      const peak = j === 0 ? 1 : 0.4 + 0.3 * hash2(k, 20 + j, seed);
      for (const off of [0, -W.L, W.L]) {                          // 루프 이음매
        B += peak * expose(ts + off, W.t, shutterT, tau);
        B += peak * 0.12 * expose(ts + off, W.t, shutterT, tauGlow); // 이어지는 약한 전류(잔광)
      }
      ts += 0.04 + 0.04 * hash2(k, 40 + j, seed);                   // 다음 뇌격까지 40~80 ms
    }
    B = clamp(B, 0, 1.3);
    if (B < 0.01) continue;
    draws.push({ k, B });
    flash = Math.max(flash, B);
  }
  camera(ctx, env, p, (c) => {
    for (const { k, B } of draws) {
      const r = createRng(seed * 31 + k * 977);                 // 줄기 모양 고정 → 다시 칠 때 같은 길
      const x = w * (0.5 + (hash2(k, 2, seed) - 0.5) * area);
      const segs = branchSegments(r, { x, y: -5, angle: Math.PI / 2 + (hash2(k, 3, seed) - 0.5) * 0.4, length: h * (0.7 + 0.35 * hash2(k, 4, seed)),
        depth: 2, branch: 0.15 + 0.5 * clamp(p.branches ?? 0.5, 0, 1), spread: 0.7, jag: 0.9, segs: 18, shrink: 0.45 });
      c.save();
      c.globalCompositeOperation = 'lighter';
      const a = Math.min(1, B);
      c.globalAlpha = a;
      drawSegments(c, segs, 1, wd * 3, rgba(col, 0.12), 1);           // 공기 중 퍼진 빛
      drawSegments(c, segs, 1, wd * 1.2, rgba(col, 0.55));
      drawSegments(c, segs, 1, Math.max(0.8, wd * 0.45), 'rgba(255,255,255,1)'); // 아주 뜨거운 통로는 흰색
      c.restore();
    }
    const fl = clamp(p.flash ?? 0.5, 0, 1) * Math.min(1, flash);
    if (fl > 0) { c.fillStyle = rgba(col, 0.5 * fl); c.fillRect(0, 0, w, h); }
  }, { bloomK: 1, bloomRad: Math.max(w, h) * 0.06 });
}

export default {
  id: 'lightning',
  name: '번개',
  category: '날씨',
  description: '갈라지는 번갯불과 화면 번쩍임(폭풍·마법·공포 연출)',
  thumbnail: { frame: 2, bg: '#0b0d16' },
  bleed: 0,
  params: [
    { key: 'strikes', label: '번개 수', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'area', label: '위치 범위', type: 'float', default: 0.8, min: 0.1, max: 1, step: 0.01 },
    { key: 'branches', label: '가지 수', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'width', label: '굵기', type: 'float', default: 3, min: 0.5, max: 10, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#d9e6ff' },
    { key: 'flash', label: '화면 번쩍', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'linger', label: '잔상(프레임)', type: 'int', default: 3, min: 1, max: 8 },
    LOOK_PARAM('real'),
    { key: 'restrike', label: '다시 치는 횟수(실사)', type: 'int', default: 3, min: 1, max: 6 },
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.7 } : q)),
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
    const seed = 1 + Math.floor(rng() * 9999);
    const n = Math.max(1, Math.round(p.strikes ?? 2));
    const fc = Math.max(1, frameCount);
    const linger = Math.max(1, Math.round(p.linger ?? 3));
    const col = parseColor(p.color ?? '#d9e6ff');
    const area = clamp(p.area ?? 0.8, 0.1, 1);
    let flash = 0;
    for (let k = 0; k < n; k++) {
      // 칠 프레임: 재생 길이를 n 칸으로 나눠 칸마다 한 번(칸 안 위치는 시드) — f 는 0..fc 를 돌아 루프
      const start = Math.floor((k + 0.15 + 0.6 * hash2(k, 1, seed)) * fc / n);
      let age = ((f % fc) - start + fc) % fc;
      if (age >= linger) continue;
      const life = 1 - age / linger;
      const r = createRng(seed * 31 + k * 977);          // 번개 모양은 번개마다 고정(프레임과 무관)
      const x = w * (0.5 + (hash2(k, 2, seed) - 0.5) * area);
      const segs = branchSegments(r, { x, y: -5, angle: Math.PI / 2 + (hash2(k, 3, seed) - 0.5) * 0.4, length: h * (0.7 + 0.35 * hash2(k, 4, seed)),
        depth: 2, branch: 0.15 + 0.5 * clamp(p.branches ?? 0.5, 0, 1), spread: 0.7, jag: 0.9, segs: 14, shrink: 0.5 });
      const wd = Math.max(0.5, p.width ?? 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life;
      drawSegments(ctx, segs, 1, wd * 2.5, rgba(col, 0.25), 1);
      drawSegments(ctx, segs, 1, wd, rgba(col, 1));
      drawSegments(ctx, segs, 1, wd * 0.4, 'rgba(255,255,255,1)');
      ctx.restore();
      flash = Math.max(flash, life * (age === 0 ? 1 : 0.5));
    }
    const fl = clamp(p.flash ?? 0.5, 0, 1) * flash;
    if (fl > 0) { ctx.fillStyle = rgba(col, 0.55 * fl); ctx.fillRect(0, 0, w, h); }
  },
};
