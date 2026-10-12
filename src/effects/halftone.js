// 하프톤 — 만화 망점 톤. 소스 밝기 따라(소스 연결) 또는 화면 전체 그라디언트. 정적(루프 자명).
import { TAU, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'halftone',
  name: '하프톤',
  category: '오버레이',
  description: '만화 같은 망점 톤',
  thumbnail: { frame: 0, bg: '#1a1f2c' },
  bleed: 0,
  params: [
    { key: 'dotSize', label: '점 크기', type: 'float', default: 5, min: 2, max: 20, step: 0.5 },
    { key: 'angle', label: '각도', type: 'float', default: 15, min: 0, max: 90, step: 1 },
    { key: 'color', label: '색', type: 'color', default: '#101418' },
    { key: 'target', label: '대상', type: 'select', default: 'gradient',
      options: [{ value: 'source', label: '소스 밝기' }, { value: 'gradient', label: '화면 그라디언트' }] },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  sources: [{ key: 'tone', label: '밝기 소스' }],
  scopes: ['full', 'box'],
  render(ctx, { w, h, sources, pad = 0, borrow, release }, p) {
    const dotSize = Math.max(2, p.dotSize ?? 5);
    const angle = (p.angle ?? 15) * Math.PI / 180;
    const color = p.color ?? '#101418';
    const op = clamp(p.opacity ?? 1, 0, 1);
    const src = p.target === 'source' ? (sources || []).find((s) => s.key === 'tone')?.canvas : null;

    let samp;
    if (src) {
      const gw = Math.max(1, Math.round(w / dotSize));
      const gh = Math.max(1, Math.round(h / dotSize));
      const tmp = borrow(gw, gh);
      const tc = tmp.getContext('2d');
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, gw, gh);
      tc.drawImage(src, 0, 0, src.width, src.height, 0, 0, gw, gh);
      const data = tc.getImageData(0, 0, gw, gh).data;
      release(tmp);
      samp = (dx, dy) => {
        const ix = clamp(Math.floor(dx / w * gw), 0, gw - 1);
        const iy = clamp(Math.floor(dy / h * gh), 0, gh - 1);
        const i = (iy * gw + ix) * 4;
        const lum = (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255;
        return (1 - lum) * (data[i + 3] / 255); // 어두울수록·불투명할수록 큰 점
      };
    } else {
      samp = (dx, dy) => clamp(Math.hypot(dx - w / 2, dy - h / 2) / (Math.hypot(w, h) / 2), 0, 1);
    }

    const spacing = dotSize * 2;
    const cx = w / 2, cy = h / 2, cos = Math.cos(angle), sin = Math.sin(angle);
    const R = Math.hypot(w, h) / 2 + spacing;
    ctx.fillStyle = withAlpha(color, op);
    for (let j = -R; j <= R; j += spacing) {
      for (let i = -R; i <= R; i += spacing) {
        const x = cx + i * cos - j * sin, y = cy + i * sin + j * cos;
        if (x < -spacing || x > w + spacing || y < -spacing || y > h + spacing) continue;
        const r = samp(x, y) * spacing * 0.62;
        if (r < 0.3) continue;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
  },
};
