// 안개 — 안개(안개·지면안개 합침). 결정론·루프(순환 노이즈 좌표).
import { TAU, fbm, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'fog',
  name: '안개',
  category: '날씨',
  description: '화면 전체 또는 바닥에 깔리는 안개',
  thumbnail: { frame: 8, bg: '#0c0f12' },
  bleed: 0,
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'full',
      options: [{ value: 'full', label: '화면 전체' }, { value: 'ground', label: '바닥' }] },
    { key: 'height', label: '높이', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    { key: 'density', label: '짙기', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'flowSpeed', label: '흐름 속도', type: 'int', default: 1, min: 1, max: 5 },
    { key: 'color', label: '색', type: 'color', default: '#cdd3db' },
    { key: 'cells', label: '해상도', type: 'int', default: 36, min: 12, max: 80, advanced: true },
  ],
  presets: [
    { id: 'mist', label: '옅은 안개', values: { density: 0.35, color: '#dfe4ea' } },
    { id: 'ground', label: '지면 안개', values: { shape: 'ground', height: 0.4 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const ground = p.shape === 'ground';
    const height = clamp(p.height ?? 0.5, 0.1, 1);
    const density = clamp(p.density ?? 0.5, 0, 1);
    const speed = Math.max(1, Math.round(p.flowSpeed ?? 1));
    const col = parseColor(p.color ?? '#cdd3db');
    const cells = Math.max(12, Math.round(p.cells ?? 36));
    const seed = Math.floor(rng() * 1000);
    const progress = f / Math.max(1, frameCount);
    const ax = Math.cos(progress * TAU * speed) * 0.8;
    const ay = Math.sin(progress * TAU * speed) * 0.4;
    const freq = 2.2;
    const cw = w / cells, ch = h / cells;

    for (let gy = 0; gy < cells; gy++) {
      const yf = (gy + 0.5) / cells;
      let vFade = 1;
      if (ground) {
        const top = 1 - height;
        vFade = yf < top ? 0 : clamp((yf - top) / Math.max(0.01, height), 0, 1);
      }
      if (vFade <= 0) continue;
      for (let gx = 0; gx < cells; gx++) {
        const n = fbm((gx / cells) * freq * (w / Math.max(w, h)) * 2 + ax, yf * freq + ay, seed, 3);
        const a = density * vFade * clamp((n - 0.3) / 0.6, 0, 1) * 0.8;
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${a.toFixed(3)})`;
        ctx.fillRect(gx * cw, gy * ch, cw + 1, ch + 1);
      }
    }
  },
};
