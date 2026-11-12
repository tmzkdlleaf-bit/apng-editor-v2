// 혈관 번짐(R28b) — 한 점(또는 가장자리)에서 혈관처럼 가지 친 선이 번져 나간다.
//   한 번형: 진행만큼 자람. 반복형: 다 자란 채로 맥박처럼 밝기가 뛴다. 결정론.
import { TAU, clamp, parseColor, rgba, PROGRESS_PARAMS, progressOf, branchSegments, drawSegments } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

export default {
  id: 'veins',
  name: '혈관 번짐',
  category: '공포',
  once: (p) => (p?.mode ?? 'once') === 'once',
  description: '혈관처럼 가지 친 선이 번져 나간다(감염·저주·변이). 한 번 번지기 또는 반복 맥박',
  thumbnail: { frame: 10, bg: '#140f10' },
  bleed: 0,
  params: [
    { key: 'mode', label: '방식', type: 'select', default: 'once',
      options: [{ value: 'once', label: '한 번(번져 나감)' }, { value: 'loop', label: '반복(맥박)' }] },
    { key: 'start', label: '시작 위치', type: 'select', default: 'point',
      options: [{ value: 'point', label: '한 점' }, { value: 'edges', label: '네 가장자리' }, { value: 'border', label: '테두리 전체' }] },
    { key: 'center', label: '점 위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'branches', label: '가지 수', type: 'int', default: 7, min: 1, max: 30 },
    { key: 'spread', label: '갈라지는 정도', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'reach', label: '뻗는 길이', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    { key: 'width', label: '굵기', type: 'float', default: 4, min: 0.5, max: 16, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#5c0612' },
    { key: 'glow', label: '번짐 빛', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
    { key: 'beats', label: '맥박 수(반복)', type: 'int', default: 2, min: 1, max: 8 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 18 } : d.key === 'progEase' ? { ...d, default: 'easeOut' } : d),
  ],
  presets: [
    { id: 'blood', label: '핏줄', values: { color: '#5c0612' } },
    { id: 'curse', label: '저주(검은 결)', values: { color: '#14101c', glow: 0.2 } },
    { id: 'toxic', label: '독(초록)', values: { color: '#2f6b1a', glow: 0.6 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const col = parseColor(p.color ?? '#5c0612');
    const once = (p.mode ?? 'once') === 'once';
    const t = once ? progressOf(f, p, ease) : 1;
    const prog = f / Math.max(1, frameCount);
    const beats = Math.max(1, Math.round(p.beats ?? 2));
    const pulse = once ? 1 : 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.cos(TAU * beats * prog), 3);
    const n = Math.max(1, Math.round(p.branches ?? 7));
    const spread = clamp(p.spread ?? 0.6, 0, 1);
    const reach = clamp(p.reach ?? 0.5, 0.1, 1) * Math.hypot(w, h) * 0.6;
    const starts = [];
    const mode = p.start ?? 'point';
    for (let i = 0; i < n; i++) {
      if (mode === 'point') {
        const a = (i / n) * TAU + (rng() - 0.5) * (TAU / n);
        starts.push([clamp(p.center?.x ?? 0.5, 0, 1) * w, clamp(p.center?.y ?? 0.5, 0, 1) * h, a]);
      } else {
        const side = mode === 'edges' ? i % 4 : Math.floor(rng() * 4);
        const tt = mode === 'edges' ? 0.5 + (rng() - 0.5) * 0.5 : rng();
        if (side === 0) starts.push([tt * w, 0, Math.PI / 2]);
        else if (side === 1) starts.push([w, tt * h, Math.PI]);
        else if (side === 2) starts.push([tt * w, h, -Math.PI / 2]);
        else starts.push([0, tt * h, 0]);
      }
    }
    const width = Math.max(0.5, p.width ?? 4);
    const glow = clamp(p.glow ?? 0.4, 0, 1);
    for (const [x, y, a] of starts) {
      const segs = branchSegments(rng, { x, y, angle: a + (rng() - 0.5) * 0.4, length: reach * (0.6 + 0.4 * rng()),
        depth: 3, branch: 0.25 + 0.45 * spread, spread: 0.4 + 0.8 * spread, jag: 0.55, segs: 9, shrink: 0.55 });
      ctx.globalAlpha = pulse;
      drawSegments(ctx, segs, t, width, rgba(col, 0.95), glow);
    }
    ctx.globalAlpha = 1;
  },
};
