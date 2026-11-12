// 종이 불타기(R28d) — 가장자리(또는 한 점)부터 타들어 가며 사라진다. 빛나는 불 테두리·그을림·재 날림.
//   한 번형. 진행 0 = 나가는 화면 그대로, 1 = 들어오는 화면(없으면 투명).
import { TAU, clamp, parseColor, rgba, fbm, smoothstep, drawField, hash2, PROGRESS_PARAMS, progressOf,
  TRANSITION_SOURCES, transitionCanvases, drawPlain } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

export default {
  id: 'paper-burn',
  name: '종이 불타기',
  category: '전환',
  once: true,
  description: '가장자리부터 타들어 가며 사라진다(빛나는 불 테두리·그을림·재)',
  thumbnail: { frame: 7, bg: '#14100c' },
  bleed: 0,
  params: [
    { key: 'start', label: '시작 위치', type: 'select', default: 'bottom',
      options: [{ value: 'bottom', label: '아래' }, { value: 'top', label: '위' }, { value: 'left', label: '왼쪽' },
        { value: 'right', label: '오른쪽' }, { value: 'point', label: '한 점' }] },
    { key: 'center', label: '점 위치', type: 'coord', default: { x: 0.5, y: 0.6 } },
    { key: 'rough', label: '타는 선 거칠기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'fire', label: '불 테두리 색', type: 'color', default: '#ff9a2e' },
    { key: 'char', label: '그을림 폭', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'ash', label: '재 날림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 24 } : d.key === 'progEase' ? { ...d, default: 'linear' } : d),
  ],
  scopes: ['full'],
  sources: TRANSITION_SOURCES,
  render(ctx, { f, w, h, rng, sources, pad = 0, scale = 1, borrow, release }, p) {
    const { out, inn } = transitionCanvases(sources);
    const t = progressOf(f, p, ease);
    if (t <= 0) { drawPlain(ctx, out, pad); return; }
    if (t >= 1) { drawPlain(ctx, inn, pad); return; }
    const seed = 1 + Math.floor(rng() * 9999);
    const asp = w / h, start = p.start ?? 'bottom';
    const cx = clamp(p.center?.x ?? 0.5, 0, 1), cy = clamp(p.center?.y ?? 0.6, 0, 1);
    const rough = clamp(p.rough ?? 0.6, 0, 1);
    const base = (u, v) => start === 'bottom' ? 1 - v : start === 'top' ? v : start === 'left' ? u : start === 'right' ? 1 - u
      : Math.hypot((u - cx) * asp, v - cy) / Math.hypot(asp, 1);
    const val = (u, v) => base(u, v) * 0.8 + rough * 0.3 * (fbm(u * 5, v * 5, seed, 4) - 0.5) + 0.1;
    const charW = 0.015 + 0.08 * clamp(p.char ?? 0.5, 0, 1);
    const glowW = 0.012;
    const level = -charW - 0.05 + (1.15 + charW + 0.1) * t;   // 이 값보다 작은 곳은 타 버림
    const W = (out ?? inn)?.width ?? Math.round(w * scale), H = (out ?? inn)?.height ?? Math.round(h * scale);
    const cols = 128, rows = Math.max(8, Math.round(128 / asp));
    const sx = W / w, sy = H / h;
    const field = (fn) => { const c = borrow(W, H); const g = c.getContext('2d'); g.scale(sx, sy); drawField(g, w, h, cols, rows, borrow, release, fn); return c; };
    // 값 지도는 한 번만 계산해 세 번 쓴다(노이즈 계산이 가장 무겁다)
    const grid = new Float32Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) grid[gy * cols + gx] = val((gx + 0.5) / cols, (gy + 0.5) / rows);
    const vAt = (gx, gy) => grid[gy * cols + gx];
    // 탄 곳(들어오는 화면 보이는 곳)
    const burned = field((gx, gy) => { const a = 1 - smoothstep(level - 0.004, level + 0.004, vAt(gx, gy)); return a > 0 ? [0, 0, 0, a] : null; });
    // 그을림(탄 곳 바로 바깥 띠)·불 테두리(경계)
    const charC = field((gx, gy) => { const v = vAt(gx, gy); const a = (1 - smoothstep(level, level + charW, v)) * smoothstep(level - 0.004, level + 0.004, v);
      return a > 0.01 ? [40, 22, 10, a * 0.85] : null; });
    const fire = parseColor(p.fire ?? '#ff9a2e');
    const fireC = field((gx, gy) => { const v = vAt(gx, gy); const a = Math.max(0, 1 - Math.abs(v - level) / glowW);
      return a > 0.01 ? [Math.min(255, fire.r + 40 * a), Math.min(255, fire.g + 60 * a), fire.b, a] : null; });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (inn) ctx.drawImage(inn, pad, pad);   // 아래에 들어오는 화면 통째로 — 남은 종이가 덮는다
    if (out) {
      // 남은 종이 = 나가는 화면 − 탄 곳, 그 위에만 그을림(source-atop). 들어오는 화면 위에 얹는다.
      const o = borrow(W, H); const oc = o.getContext('2d');
      oc.drawImage(out, 0, 0); oc.globalCompositeOperation = 'destination-out'; oc.drawImage(burned, 0, 0);
      oc.globalCompositeOperation = 'source-atop'; oc.drawImage(charC, 0, 0);
      ctx.drawImage(o, pad, pad); release(o);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(fireC, pad, pad);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(fireC, pad, pad);
    ctx.restore();
    release(burned); release(charC); release(fireC);
    // 재 날림: 타는 선 근처에서 위로 떠오르는 작은 불티
    const ash = clamp(p.ash ?? 0.5, 0, 1);
    if (ash > 0) {
      const n = Math.round(90 * ash);
      for (let i = 0; i < n; i++) {
        // 타는 선 위의 점 찾기: 무작위 u 에서 v 를 몇 번 훑어 경계 근처를 고른다(결정론)
        const u = hash2(i, 1, seed);
        let best = -1, bd = 9;
        for (let k = 0; k <= 16; k++) { const v = k / 16; const d = Math.abs(val(u, v) - level); if (d < bd) { bd = d; best = v; } }
        if (bd > 0.06) continue;
        const life = hash2(i, 2, seed);
        const rise = (0.02 + 0.08 * life) * h;
        const x = u * w + (hash2(i, 3, seed) - 0.5) * 12, y = best * h - rise;
        ctx.fillStyle = rgba({ r: 255, g: 170 + 60 * life | 0, b: 80 }, 0.9 * (1 - life * 0.6));
        ctx.beginPath(); ctx.arc(x, y, 0.8 + 1.6 * hash2(i, 4, seed), 0, TAU); ctx.fill();
      }
    }
  },
};
