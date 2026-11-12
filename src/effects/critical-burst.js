// 크리티컬 금빛 폭발(R28d) — 다이스 컷인용. 번쩍(흰 화면) → 빛줄기 → 금가루·불티 → 고리 퍼짐 → 잔광.
//   소스 없이도 쓴다(소스가 있으면 번쩍 순간 그 그림을 밝게). 한 번형. 펌블용 붉은 프리셋.
import { TAU, clamp, parseColor, rgba, hash2, smoothstep, PROGRESS_PARAMS, progressOf } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

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
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 20 } : d.key === 'progEase' ? { ...d, default: 'linear' } : d),
  ],
  presets: [
    { id: 'critical', label: '크리티컬(금빛)', values: { color: '#ffcc4d', color2: '#fff4c9' } },
    { id: 'fumble', label: '펌블(붉은빛)', values: { color: '#d8262b', color2: '#ffb3a8', rays: 10 } },
    { id: 'magic', label: '마법(푸른빛)', values: { color: '#4da3ff', color2: '#d9f0ff' } },
  ],
  scopes: ['full', 'box'],
  sources: [{ key: 'below', label: '밝게 할 그림(선택)' }],
  render(ctx, { f, w, h, rng, sources, pad = 0 }, p) {
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
