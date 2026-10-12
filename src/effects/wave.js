// 물결 — 소스(아래 레이어/그룹)를 물결치듯 휘게 한다. 결정론·루프(정수 바퀴 위상).
// 쓰는 법: 휘게 할 레이어를 숨기고 이 효과의 소스로 연결하면 그 화면이 휘어 보인다.
import { TAU, clamp } from './_fx-util.js';

export default {
  id: 'wave',
  name: '물결',
  category: '오버레이',
  description: '소스 화면이 물결치듯 흔들린다',
  thumbnail: { frame: 6, bg: '#0a0e14' },
  bleed: 20,
  params: [
    { key: 'amplitude', label: '진폭', type: 'float', default: 0.3, min: 0, max: 1, step: 0.01 },
    { key: 'wavelength', label: '파장', type: 'float', default: 0.25, min: 0.05, max: 1, step: 0.01 },
    { key: 'direction', label: '방향', type: 'select', default: 'horizontal',
      options: [{ value: 'horizontal', label: '가로 흔들림' }, { value: 'vertical', label: '세로 흔들림' }] },
    { key: 'speed', label: '속도', type: 'int', default: 1, min: 0, max: 6 },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(아래 화면)' }],
  render(ctx, { f, frameCount, sources, pad = 0 }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const amp = clamp(p.amplitude ?? 0.3, 0, 1) * Math.min(W, H) * 0.08;
    const wl = clamp(p.wavelength ?? 0.25, 0.05, 1) * Math.min(W, H);
    const horizontal = (p.direction ?? 'horizontal') === 'horizontal';
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const progress = f / Math.max(1, frameCount);
    const phase = progress * TAU * speed;
    const step = 2;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (horizontal) {
      for (let y = 0; y < H; y += step) {
        const dx = Math.sin((y / wl) * TAU + phase) * amp;
        ctx.drawImage(src, 0, y, W, step, pad + dx, pad + y, W, step);
      }
    } else {
      for (let x = 0; x < W; x += step) {
        const dy = Math.sin((x / wl) * TAU + phase) * amp;
        ctx.drawImage(src, x, 0, step, H, pad + x, pad + dy, step, H);
      }
    }
    ctx.restore();
  },
};
