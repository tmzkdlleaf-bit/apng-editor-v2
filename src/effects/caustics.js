// 코스틱 — 물빛 일렁임 무늬. 결정론·루프(cos/sin 로 노이즈 좌표 순환).
import { TAU, fbm, parseColor, clamp, drawField } from './_fx-util.js';

export default {
  id: 'caustics',
  name: '코스틱',
  category: '빛',
  lightBg: true, // R27 밝은 배경용(테두리·진하게) 지원
  description: '물빛이 일렁이는 무늬',
  thumbnail: { frame: 8, bg: '#071018' },
  bleed: 0,
  params: [
    { key: 'size', label: '크기', type: 'float', default: 0.5, min: 0.1, max: 1.5, step: 0.01 },
    { key: 'speed', label: '속도', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#9fe8ff' },
    { key: 'cells', label: '해상도', type: 'int', default: 72, min: 16, max: 128, advanced: true },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng, borrow, release }, p) {
    const freq = (p.size ?? 0.5) * 6;
    const speed = Math.max(1, Math.round(p.speed ?? 1));
    const intensity = clamp(p.intensity ?? 0.6, 0, 1);
    const col = parseColor(p.color ?? '#9fe8ff');
    const cells = Math.max(8, Math.round(p.cells ?? 72));
    const seed = Math.floor(rng() * 1000);
    const progress = f / Math.max(1, frameCount);
    // 순환 오프셋(루프): 노이즈 좌표를 원으로 돌린다
    const ax = Math.cos(progress * TAU * speed) * 1.2;
    const ay = Math.sin(progress * TAU * speed) * 1.2;

    // 칸 값을 작은 캔버스에 쓰고 부드럽게 늘려 그린다(R27: 칸 겹침 격자 줄·계단 제거).
    drawField(ctx, w, h, cells, cells, borrow, release, (gx, gy) => {
      const nx = (gx / cells) * freq + ax;
      const ny = (gy / cells) * freq + ay;
      // R32: 물 밑 빛 무늬는 '가는 밝은 그물'이다(능선 노이즈). 예전 문턱 방식은 프레임 대부분이 비었다.
      const r1 = 1 - Math.abs(2 * fbm(nx, ny, seed, 2) - 1);
      const r2 = 1 - Math.abs(2 * fbm(nx * 1.7 + 3.1, ny * 1.7 - 1.3, seed + 7, 2) - 1);
      const n = clamp(Math.pow(r1, 10) + 0.6 * Math.pow(r2, 13), 0, 1);
      if (n <= 0.02) return null;
      return [col.r, col.g, col.b, intensity * n];
    }, 'high');
  },
};
