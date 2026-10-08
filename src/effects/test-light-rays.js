// [시험] 빛줄기 — 파라미터 타입을 모두 써 보는 시험 효과(틀 검증용).
// 결정론(rng만, Date.now/random 금지) · 루프(progress = f/frameCount, f=0과 f=N 동일).
export default {
  id: 'test-light-rays',
  name: '[시험] 빛줄기',
  category: '빛',
  params: [
    { key: 'count',     label: '줄기 수', type: 'int',   default: 12, min: 1, max: 60 },
    { key: 'length',    label: '길이',    type: 'float', default: 0.7, min: 0.1, max: 1, step: 0.01 },
    { key: 'thickness', label: '굵기',    type: 'float', default: 3, min: 0.5, max: 20, step: 0.5 },
    { key: 'angle',     label: '각도',    type: 'float', default: 45, min: 0, max: 360, step: 1, animatable: true },
    { key: 'origin',    label: '중심',    type: 'coord', default: { x: 0.5, y: 0.0 } },
    { key: 'color',     label: '색',      type: 'color', default: '#ffeeaa' },
    { key: 'intensity', label: '세기',    type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'quality',   label: '품질',    type: 'select', default: 'low',
      options: [{ value: 'low', label: '낮음' }, { value: 'high', label: '높음' }] },
    { key: 'shimmer',   label: '반짝임',  type: 'bool',  default: true },
    { key: 'blur',      label: '흐림',    type: 'float', default: 0, min: 0, max: 10, step: 0.5, advanced: true },
  ],
  scopes: ['full', 'box'],
  sources: [],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count     = Math.max(1, Math.round(p.count ?? 12));
    const length    = (p.length ?? 0.7) * Math.hypot(w, h);
    const thickness = p.thickness ?? 3;
    const angle     = (p.angle ?? 45) * Math.PI / 180;
    const origin    = p.origin ?? { x: 0.5, y: 0 };
    const color     = p.color ?? '#ffeeaa';
    const intensity = p.intensity ?? 0.6;
    const shimmer   = p.shimmer ?? true;

    const ox = (origin.x ?? 0.5) * w, oy = (origin.y ?? 0) * h;
    const progress = f / Math.max(1, frameCount); // 루프 위상
    const spread = (p.quality === 'high') ? 0.9 : 0.6;

    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const jitter = (rng() - 0.5) * spread;      // 결정론 per-ray
      const a = angle + jitter;
      const phase = rng() * Math.PI * 2;
      const sh = shimmer ? (0.5 + 0.5 * Math.sin(progress * Math.PI * 2 + phase)) : 1;
      const len = length * (0.6 + 0.4 * rng());
      ctx.globalAlpha = Math.max(0, Math.min(1, intensity * sh));
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  },
};
