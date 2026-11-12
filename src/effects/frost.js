// 성에(R28e) — 창 가장자리부터 얼음 결정 무늬가 덮인다. 가운데 닦인 자리(원).
//   방식: 반복(살짝 반짝임) / 한 번(서서히 끼기 — 진행). 결정 결 = 가지 선 + 옅은 서리 바탕.
import { TAU, clamp, parseColor, rgba, fbm, smoothstep, drawField, branchSegments, drawSegments, PROGRESS_PARAMS, progressOf } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';
import { createRng } from '../core/render/rng.js';

export default {
  id: 'frost',
  name: '성에',
  category: '날씨',
  lightBg: true,
  once: (p) => (p?.mode ?? 'loop') === 'once',
  description: '창 가장자리부터 얼음 결정 무늬가 덮인다(겨울·추위·얼어붙는 연출). 가운데 닦인 자리',
  thumbnail: { frame: 6, bg: '#0e1622' },
  bleed: 0,
  params: [
    { key: 'mode', label: '방식', type: 'select', default: 'loop',
      options: [{ value: 'loop', label: '반복(살짝 반짝임)' }, { value: 'once', label: '한 번(서서히 끼기)' }] },
    { key: 'cover', label: '덮는 정도', type: 'float', default: 0.45, min: 0.05, max: 1, step: 0.01 },
    { key: 'grain', label: '결정 결 크기', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.05 },
    { key: 'color', label: '색', type: 'color', default: '#e8f4ff' },
    { key: 'clear', label: '닦인 자리', type: 'bool', default: true },
    { key: 'center', label: '닦인 자리 위치', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'clearSize', label: '닦인 자리 크기', type: 'float', default: 0.3, min: 0.05, max: 0.8, step: 0.01 },
    { key: 'cycles', label: '반짝임 횟수', type: 'int', default: 1, min: 1, max: 6 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 24 } : d.key === 'progEase' ? { ...d, default: 'easeOut' } : d),
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng, borrow, release }, p) {
    const seed = 1 + Math.floor(rng() * 9999);
    const once = (p.mode ?? 'loop') === 'once';
    const t = once ? progressOf(f, p, ease) : 1;
    if (t <= 0) return;
    const col = parseColor(p.color ?? '#e8f4ff');
    const cover = clamp(p.cover ?? 0.45, 0.05, 1) * t;
    const grain = clamp(p.grain ?? 0.5, 0.1, 1);
    const prog = f / Math.max(1, frameCount);
    const cyc = Math.max(1, Math.round(p.cycles ?? 1));
    const sparkle = once ? 1 : 0.85 + 0.15 * Math.sin(TAU * cyc * prog);
    const asp = w / h;
    const ccx = clamp(p.center?.x ?? 0.5, 0, 1), ccy = clamp(p.center?.y ?? 0.5, 0, 1), cr = clamp(p.clearSize ?? 0.3, 0.05, 0.8);
    const useClear = p.clear !== false;
    // 가장자리에서의 거리(0 가장자리 ~ 0.5 가운데) + 노이즈 → 덮는 정도보다 작은 곳이 서리
    // 가장자리까지 거리 — 모서리가 둥근 사각형(초타원) 기준이라 가운데 맑은 자리가 네모로 보이지 않는다
    const edgeD = (u, v) => 0.5 - Math.pow(Math.pow(Math.abs(u - 0.5), 2.5) + Math.pow(Math.abs(v - 0.5), 2.5), 0.4);
    const frostA = (u, v) => {
      const d = edgeD(u, v) + 0.22 * (fbm(u * 5, v * 5, seed, 3) - 0.5);
      let a = 1 - smoothstep(cover * 0.5 - 0.06, cover * 0.5 + 0.02, d);
      if (useClear) a *= smoothstep(cr * 0.5, cr * 0.5 + 0.08, Math.hypot((u - ccx) * asp, v - ccy));
      return a;
    };
    // 1) 서리 바탕(옅은 뿌연 층)
    drawField(ctx, w, h, 96, Math.max(8, Math.round(96 / asp)), borrow, release, (gx, gy) => {
      const u = (gx + 0.5) / 96, v = (gy + 0.5) / Math.max(8, Math.round(96 / asp));
      const a = frostA(u, v) * (0.45 + 0.2 * fbm(u * 30 * grain, v * 30 * grain, seed + 5, 2));
      return a > 0.01 ? [col.r, col.g, col.b, a * sparkle] : null;
    });
    // 2) 결정 결: 가장자리에서 안쪽으로 뻗는 가지 선(서리 영역 안에서만 보이게 길이 제한)
    const r = createRng(seed * 7 + 3);
    const n = Math.round(18 + 30 * (1 - grain));
    ctx.save();
    ctx.globalAlpha = 0.85 * sparkle;
    for (let i = 0; i < n; i++) {
      const side = i % 4, tt = r();
      const [x, y, a] = side === 0 ? [tt * w, 0, Math.PI / 2] : side === 1 ? [w, tt * h, Math.PI] : side === 2 ? [tt * w, h, -Math.PI / 2] : [0, tt * h, 0];
      const len = Math.min(w, h) * cover * 0.55 * (0.5 + 0.8 * r());
      const segs = branchSegments(r, { x, y, angle: a + (r() - 0.5) * 0.9, length: len, depth: 3, branch: 0.55, spread: 1.0, jag: 0.25, segs: 7, shrink: 0.5 });
      drawSegments(ctx, segs, 1, 1.2 + 1.2 * grain, rgba(col, 0.9));
    }
    ctx.restore();
    if (useClear) {
      // 닦인 자리 안의 결은 지운다(부드럽게)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(ccx * w, ccy * h, 0, ccx * w, ccy * h, cr * 0.5 * h + 0.08 * h);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(cr * 0.5 * h / (cr * 0.5 * h + 0.08 * h), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  },
};
