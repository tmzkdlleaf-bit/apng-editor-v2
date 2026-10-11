// 광택 — 표면을 스치는 윤기 반사 띠. 소스 레이어 모양 안에만(없으면 전체). 결정론·루프.
import { withAlpha, frac, clamp } from './_fx-util.js';

export default {
  id: 'sheen',
  name: '광택',
  category: '빛',
  description: '소스 모양 위를 스치는 윤기 반사 띠',
  thumbnail: { frame: 6, bg: '#101826' },
  bleed: 0,
  params: [
    { key: 'angle', label: '각도', type: 'float', default: 30, min: -90, max: 90, step: 1 },
    { key: 'width', label: '폭', type: 'float', default: 0.18, min: 0.02, max: 0.6, step: 0.01 },
    { key: 'passes', label: '지나가는 횟수', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
  ],
  scopes: ['full'], // 표면 반사 — 소스 모양/마스크와 함께. 박스 범위는 의미가 적어 제외.
  sources: [{ key: 'shape', label: '모양' }],
  render(ctx, { f, frameCount, w, h, sources, pad = 0 }, p) {
    const angle = (p.angle ?? 30) * Math.PI / 180;
    const bandW = clamp(p.width ?? 0.18, 0.02, 0.6) * Math.hypot(w, h);
    const passes = Math.max(1, Math.round(p.passes ?? 1));
    const intensity = clamp(p.intensity ?? 0.8, 0, 1);
    const color = p.color ?? '#ffffff';
    const progress = f / Math.max(1, frameCount);

    // 띠 중심이 화면 대각을 가로질러 반복(정수 횟수 → 루프)
    const travel = frac(progress * passes); // 0..1
    const diag = Math.hypot(w, h);
    const nx = Math.cos(angle + Math.PI / 2), ny = Math.sin(angle + Math.PI / 2);
    const cx = w / 2, cy = h / 2;
    const d0 = (travel * 2 - 1) * diag; // 축 방향 중심 위치

    ctx.save();
    // 회전해 세로 띠로 그린 뒤 그라디언트
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(-bandW, 0, bandW, 0);
    g.addColorStop(0, withAlpha(color, 0));
    g.addColorStop(0.5, withAlpha(color, intensity));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.translate(d0, 0);
    ctx.fillStyle = g;
    ctx.fillRect(-bandW, -diag, bandW * 2, diag * 2);
    ctx.restore();

    // 소스 모양 안으로 제한(있으면)
    const src = (sources || []).find((s) => s.key === 'shape')?.canvas;
    if (src) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(src, pad, pad);
      ctx.restore();
    }
  },
};
