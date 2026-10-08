// [시험] 소스 비추기 — 다른 레이어(소스 슬롯)를 재료로 비추는 시험 효과(소스 슬롯 틀 검증용).
// render 의 ctx 컨텍스트에 sources[{key, canvas}] 가 전달된다(effect.js 가 소스 레이어를 렌더해 넘김).
export default {
  id: 'test-source-mirror',
  name: '[시험] 소스 비추기',
  category: '연출',
  params: [
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
    { key: 'flip',    label: '좌우 반전', type: 'bool', default: false },
    { key: 'tint',    label: '색조',     type: 'color', default: '#ffffff' },
  ],
  scopes: ['full'],
  sources: [{ key: 'src', label: '비출 레이어' }],
  render(ctx, { w, h, sources }, p) {
    const src = (sources ?? []).find((s) => s.key === 'src');
    if (!src?.canvas) return;
    const opacity = p.opacity ?? 0.8;
    const flip = !!p.flip;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src.canvas, 0, 0, w, h);
    // 색조(간단히 곱하기 오버레이)
    if ((p.tint ?? '#ffffff') !== '#ffffff') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = p.tint;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  },
};
