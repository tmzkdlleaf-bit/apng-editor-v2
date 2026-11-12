// 흘러내림(R28b) — 위에서 액체 줄기가 흘러내린다(피·잉크). 반복형: 가는 물길을 따라 굵은 방울이 계속 흘러내림.
//   한 번형: 줄기가 위에서부터 자라 내려온다(진행). 결정론·루프(정수 속도).
import { TAU, clamp, parseColor, rgba, PROGRESS_PARAMS, progressOf, hash2 } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

function _wob(y, i, seed, k) { // 줄기 가로 흔들림(위치에 고정된 모양 — 시간과 무관)
  return Math.sin(y * 0.031 + hash2(i, 1, seed) * TAU) * k + Math.sin(y * 0.077 + hash2(i, 2, seed) * TAU) * k * 0.4;
}

export default {
  id: 'drip',
  name: '흘러내림',
  category: '공포',
  once: (p) => (p?.mode ?? 'loop') === 'once',
  description: '위에서 액체 줄기가 흘러내린다(피·잉크). 반복 또는 한 번(자라 내려옴)',
  thumbnail: { frame: 8, bg: '#14100f' },
  bleed: 0,
  params: [
    { key: 'mode', label: '방식', type: 'select', default: 'loop',
      options: [{ value: 'loop', label: '반복(계속 흐름)' }, { value: 'once', label: '한 번(자라 내려옴)' }] },
    { key: 'count', label: '줄기 수', type: 'int', default: 12, min: 1, max: 60 },
    { key: 'length', label: '길이', type: 'float', default: 0.6, min: 0.1, max: 1, step: 0.01 },
    { key: 'width', label: '굵기', type: 'float', default: 7, min: 1, max: 30, step: 0.5 },
    { key: 'vary', label: '굵기 들쭉날쭉', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'drops', label: '끝 방울', type: 'bool', default: true },
    { key: 'gloss', label: '번들거림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'speed', label: '흐르는 속도', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'color', label: '색', type: 'color', default: '#6e0b0b' },
    { key: 'top', label: '위쪽 고임', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 24 } : d.key === 'progEase' ? { ...d, default: 'easeOut' } : d),
  ],
  presets: [
    { id: 'blood', label: '피', values: { color: '#6e0b0b', gloss: 0.5 } },
    { id: 'ink', label: '잉크', values: { color: '#101014', gloss: 0.3 } },
    { id: 'slime', label: '점액', values: { color: '#4f7a1a', gloss: 0.7, width: 10 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const seed = 1 + Math.floor(rng() * 9999);
    const n = Math.max(1, Math.round(p.count ?? 12));
    const L = clamp(p.length ?? 0.6, 0.1, 1) * h;
    const bw = Math.max(1, p.width ?? 7);
    const vary = clamp(p.vary ?? 0.5, 0, 1);
    const col = parseColor(p.color ?? '#6e0b0b');
    const hi = { r: Math.min(255, col.r + 90), g: Math.min(255, col.g + 70), b: Math.min(255, col.b + 70) };
    const dark = { r: col.r * 0.55 | 0, g: col.g * 0.55 | 0, b: col.b * 0.55 | 0 };
    const gloss = clamp(p.gloss ?? 0.5, 0, 1);
    const once = (p.mode ?? 'loop') === 'once';
    const grow = once ? progressOf(f, p, ease) : 1;
    const prog = f / Math.max(1, frameCount);
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const topK = clamp(p.top ?? 0.5, 0, 1);

    // 위쪽 고임(물결진 띠)
    if (topK > 0) {
      const th = 6 + topK * 22;
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
      for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, th * grow * (0.6 + 0.4 * Math.sin(x * 0.05 + seed)) );
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const x0 = (i + 0.2 + 0.6 * hash2(i, 3, seed)) / n * w;
      const li = L * (0.45 + 0.55 * hash2(i, 4, seed)) * grow;
      const wi = bw * (1 - vary * 0.6 * hash2(i, 5, seed));
      if (li < 1) continue;
      // 물길(위가 굵고 아래로 가늘어짐) — 왼쪽 경계 + 오른쪽 경계 다각형
      const steps = Math.max(6, Math.round(li / 10));
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const y = li * s / steps, k = 1 - 0.45 * (s / steps);
        ctx.lineTo(x0 + _wob(y, i, seed, 3) - wi * k / 2, y);
      }
      for (let s = steps; s >= 0; s--) {
        const y = li * s / steps, k = 1 - 0.45 * (s / steps);
        ctx.lineTo(x0 + _wob(y, i, seed, 3) + wi * k / 2, y);
      }
      ctx.closePath(); ctx.fill();
      // 끝 방울
      if (p.drops !== false) {
        const r = wi * 0.75;
        ctx.beginPath(); ctx.arc(x0 + _wob(li, i, seed, 3), li, r, 0, TAU); ctx.fill();
      }
      // 반복형: 물길을 따라 내려가는 굵은 덩이(정수 속도 → 루프)
      if (!once) {
        const ph = (prog * speed + hash2(i, 6, seed)) % 1;
        const by = ph * (li + wi * 3) - wi;
        const br = wi * (0.85 + 0.25 * Math.sin(ph * TAU));
        ctx.fillStyle = rgba(dark, 0.55);
        ctx.beginPath(); ctx.ellipse(x0 + _wob(by, i, seed, 3), by, br * 0.7, br * 1.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(col, 1);
        ctx.beginPath(); ctx.ellipse(x0 + _wob(by, i, seed, 3), by, br * 0.62, br * 1.25, 0, 0, TAU); ctx.fill();
      }
      // 번들거림: 왼쪽 위 밝은 줄
      if (gloss > 0) {
        ctx.strokeStyle = rgba(hi, 0.55 * gloss);
        ctx.lineWidth = Math.max(0.8, wi * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) { const y = li * s / steps * 0.92; ctx.lineTo(x0 + _wob(y, i, seed, 3) - wi * 0.22 * (1 - 0.45 * s / steps), y); }
        ctx.stroke();
      }
    }
  },
};
