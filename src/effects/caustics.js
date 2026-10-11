// 코스틱 — 물빛 일렁임 무늬. 결정론·루프(cos/sin 로 노이즈 좌표 순환).
import { TAU, fbm, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'caustics',
  name: '코스틱',
  category: '빛',
  description: '물빛이 일렁이는 무늬',
  thumbnail: { frame: 8, bg: '#071018' },
  bleed: 0,
  params: [
    { key: 'size', label: '크기', type: 'float', default: 0.5, min: 0.1, max: 1.5, step: 0.01 },
    { key: 'speed', label: '속도', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#9fe8ff' },
    { key: 'cells', label: '해상도', type: 'int', default: 40, min: 16, max: 96, advanced: true },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const freq = (p.size ?? 0.5) * 6;
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const intensity = clamp(p.intensity ?? 0.6, 0, 1);
    const col = parseColor(p.color ?? '#9fe8ff');
    const cells = Math.max(8, Math.round(p.cells ?? 40));
    const seed = Math.floor(rng() * 1000);
    const progress = f / Math.max(1, frameCount);
    // 순환 오프셋(루프): 노이즈 좌표를 원으로 돌린다
    const ax = Math.cos(progress * TAU * speed) * 1.2;
    const ay = Math.sin(progress * TAU * speed) * 1.2;

    const cw = w / cells, ch = h / cells;
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        const nx = (gx / cells) * freq + ax;
        const ny = (gy / cells) * freq + ay;
        let n = fbm(nx, ny, seed, 2);
        // 밝은 능선만(코스틱 느낌): 가파른 대비
        n = Math.pow(clamp((n - 0.45) / 0.3, 0, 1), 2.2);
        if (n <= 0.02) continue;
        ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${(intensity * n).toFixed(3)})`;
        ctx.fillRect(gx * cw, gy * ch, cw + 1, ch + 1);
      }
    }
  },
};
