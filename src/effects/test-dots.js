// [시험] 점 이펙트 — 결정론적 RNG로 점을 그림
// params: { count=200, radius=4, color='#ffffff', phase=true }
export const testDotsEffect = {
  name: '[시험] 점',
  evaluate(ctx, f, params, { width, height, frameCount, rng }) {
    const count  = params.count  ?? 200;
    const radius = params.radius ?? 4;
    const color  = params.color  ?? '#ffffff';
    const phase  = params.phase  ?? true;

    const progress = frameCount <= 1 ? 0 : f / (frameCount - 1);

    ctx.fillStyle = color;

    for (let i = 0; i < count; i++) {
      const x   = rng() * width;
      const y   = rng() * height;
      const r   = radius * (0.5 + rng() * 0.5);
      // phase: 점이 깜빡임
      const vis = phase ? (rng() < 0.3 + 0.7 * Math.abs(Math.sin(progress * Math.PI * 2 + rng() * Math.PI * 2))) : true;
      if (!vis) { rng(); continue; } // rng 소비량 일정하게

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
