// 번개(R28e) — 갈라지는 번갯불 + 화면 번쩍. 한 번 재생에 몇 번 치는지(정수) — 같은 순서로 반복(루프).
import { clamp, parseColor, rgba, hash2, branchSegments, drawSegments } from './_fx-util.js';
import { createRng } from '../core/render/rng.js';

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
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
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
