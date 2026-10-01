// [시험] 점 이펙트 — 결정론적 RNG로 점을 그림
// 루프 보장: phase = f / frameCount (frameCount-1 사용 금지)
export default {
  id: 'test-dots',
  name: '[시험] 점',
  category: 'test',
  params: [
    { key: 'count',  label: '개수',   type: 'int',    default: 200, min: 1, max: 2000 },
    { key: 'radius', label: '반지름', type: 'float',  default: 4,   min: 0.5, max: 20 },
    { key: 'color',  label: '색',     type: 'color',  default: '#ffffff' },
    { key: 'phase',  label: '깜빡임', type: 'bool',   default: true },
  ],
  scopes: ['full'],
  sources: [],
  render(ctx, { f, frameCount, w, h, rng }, params) {
    const count  = params.count  ?? 200;
    const radius = params.radius ?? 4;
    const color  = params.color  ?? '#ffffff';
    const phase  = params.phase  ?? true;

    // 루프 보장: f=0, f=frameCount → phase 동일
    const progress = f / Math.max(1, frameCount);

    ctx.fillStyle = color;

    for (let i = 0; i < count; i++) {
      const x   = rng() * w;
      const y   = rng() * h;
      const r   = radius * (0.5 + rng() * 0.5);
      const vis = phase
        ? (rng() < 0.3 + 0.7 * Math.abs(Math.sin(progress * Math.PI * 2 + rng() * Math.PI * 2)))
        : (rng(), true);
      if (!vis) continue;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
