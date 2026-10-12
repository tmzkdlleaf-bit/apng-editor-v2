// 글리치 — 지지직 깨짐. 소스(아래 레이어/그룹) 연결 시 그 화면을 띠로 밀고 색 어긋남.
// 소스 없으면 색 글리치 띠 오버레이. 결정론·루프(burst 를 frequency 로 순환).
import { frac, hash2, withAlpha, clamp, rgbSplit } from './_fx-util.js';

export default {
  id: 'glitch',
  name: '글리치',
  category: '오버레이',
  description: '지지직 깨지는 글리치(소스 화면을 밀고 색 어긋남)',
  thumbnail: { frame: 2, bg: '#0a0a12' },
  bleed: 20,
  params: [
    { key: 'intensity', label: '세기', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'frequency', label: '빈도', type: 'int', default: 3, min: 1, max: 12 },
    { key: 'bands', label: '띠 수', type: 'int', default: 12, min: 2, max: 40 },
    { key: 'colorShift', label: '색 어긋남', type: 'bool', default: true },
    { key: 'color', label: '색', type: 'color', default: '#ff2d6b' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(아래 화면)' }],
  render(ctx, { f, frameCount, w, h, rng, scale = 1, sources, pad = 0, borrow, release }, p) {
    const intensity = clamp(p.intensity ?? 0.5, 0, 1);
    const freq = Math.max(1, Math.round(p.frequency ?? 3));
    const bands = Math.max(2, Math.round(p.bands ?? 12));
    const colorShift = p.colorShift ?? true;
    const op = clamp(p.opacity ?? 1, 0, 1);
    const seed = Math.floor(rng() * 100000);
    const progress = f / Math.max(1, frameCount);
    const gt = frac(progress * freq);
    const active = gt < 0.35;
    const burst = Math.floor(progress * freq) % freq;

    const src = (sources || []).find((s) => s.key === 'below')?.canvas;

    if (!src) {
      // 자체 색 글리치 띠
      if (!active) return;
      ctx.globalAlpha = op;
      for (let b = 0; b < bands; b++) {
        if (hash2(b, burst, seed) > 0.4) continue;
        const y = (b / bands) * h, bh = h / bands;
        const off = (hash2(b, burst, seed + 3) - 0.5) * intensity * w * 0.3;
        ctx.fillStyle = withAlpha(hash2(b, burst, seed + 9) < 0.5 ? (p.color ?? '#ff2d6b') : '#2dd9ff', 0.5 + 0.5 * intensity);
        ctx.fillRect(off, y, w, bh * (0.4 + hash2(b, burst, seed + 5)));
      }
      ctx.globalAlpha = 1;
      return;
    }

    // 소스 있음: 띠별 가로 밀기
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = op;
    if (!active) { ctx.drawImage(src, pad, pad); ctx.restore(); return; }
    const bh = src.height / bands;
    for (let b = 0; b < bands; b++) {
      const shift = hash2(b, burst, seed + 7) < 0.55 ? (hash2(b, burst, seed + 11) - 0.5) * intensity * src.width * 0.3 : 0;
      ctx.drawImage(src, 0, b * bh, src.width, bh + 1, pad + shift, pad + b * bh, src.width, bh + 1);
    }
    ctx.restore();

    if (colorShift) {
      const d = intensity * 8 * scale;
      rgbSplit(ctx, src, pad, d, 0, -d, 0, borrow, release);
    }
  },
};
