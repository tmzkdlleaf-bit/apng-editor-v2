// 색수차 — 빨강·파랑이 어긋나 번짐. 소스(아래 레이어/그룹)를 RGB 로 어긋나게. 결정론·루프.
// 쓰는 법: 대상 레이어를 숨기고 이 효과의 소스로 연결.
import { TAU, clamp, rgbSplit } from './_fx-util.js';

export default {
  id: 'chromatic',
  name: '색수차',
  category: '오버레이',
  description: '빨강·파랑이 어긋나 번지는 색수차',
  thumbnail: { frame: 4, bg: '#0a0a12' },
  bleed: 16,
  params: [
    { key: 'offset', label: '어긋남 거리', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'direction', label: '방향', type: 'float', default: 0, min: 0, max: 360, step: 1 },
    { key: 'pulse', label: '맥동', type: 'int', default: 0, min: 0, max: 6 },
    { key: 'range', label: '범위', type: 'select', default: 'edge',
      options: [{ value: 'edge', label: '가장자리만' }, { value: 'full', label: '전체' }] },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(아래 화면)' }],
  render(ctx, { f, frameCount, scale = 1, sources, pad = 0, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const pulse = Math.max(0, Math.round(p.pulse ?? 0));
    const progress = f / Math.max(1, frameCount);
    const mod = pulse > 0 ? (0.5 + 0.5 * Math.sin(progress * TAU * pulse)) : 1;
    const base = clamp(p.offset ?? 0.4, 0, 1) * (p.range === 'full' ? 18 : 9) * scale;
    const off = base * mod;
    const ang = (p.direction ?? 0) * Math.PI / 180;
    const dx = Math.cos(ang) * off, dy = Math.sin(ang) * off;
    rgbSplit(ctx, src, pad, dx, dy, -dx, -dy, borrow, release);
  },
};
