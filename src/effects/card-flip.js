// 카드 뒤집기(R28d) — 앞면·뒷면 두 그림을 카드처럼 뒤집는다. 세로축(좌우로 뒤집기)·가로축(위아래로).
//   가짜 원근: 띠마다 높이를 달리해 가까운 쪽이 커 보이게. 뒤집는 동안 살짝 떠오름·광택·그림자.
//   뒷면이 없으면 앞면을 좌우 반전 + 어둡게. 한 번형. 진행 0 = 앞면 그대로, 1 = 뒷면 그대로.
import { clamp, PROGRESS_PARAMS, progressOf, drawPlain, alphaBounds } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

export default {
  id: 'card-flip',
  name: '카드 뒤집기',
  category: '전환',
  once: true,
  description: '앞면·뒷면 그림을 카드처럼 뒤집는다(원근·떠오름·광택·그림자)',
  thumbnail: { frame: 5, bg: '#1d1f26' },
  bleed: 40,
  params: [
    { key: 'axis', label: '축', type: 'select', default: 'vertical',
      options: [{ value: 'vertical', label: '좌우로 뒤집기' }, { value: 'horizontal', label: '위아래로 뒤집기' }] },
    { key: 'persp', label: '원근 정도', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'lift', label: '떠오름', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'gloss', label: '광택', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'shadow', label: '그림자', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 14 } : d),
  ],
  scopes: ['full'],
  sources: [{ key: 'front', label: '앞면' }, { key: 'back', label: '뒷면(없으면 앞면 반전)' }],
  render(ctx, { f, sources, pad = 0, borrow, release }, p) {
    const get = (k) => (sources || []).find((s) => s.key === k)?.canvas ?? null;
    const front = get('front'), back = get('back');
    const t = progressOf(f, p, ease);
    if (t <= 0) { drawPlain(ctx, front, pad); return; }
    if (t >= 1 && back) { drawPlain(ctx, back, pad); return; }   // 뒷면이 없으면 아래에서 반전된 앞면을 그린다
    const base = front ?? back;
    if (!base) return;
    const W = base.width, H = base.height;
    const vert = (p.axis ?? 'vertical') === 'vertical';
    const ang = Math.PI * clamp(t, 0, 1);
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const showBack = cosA < 0;
    let face = showBack ? back : front;
    let mirrored = false;
    if (!face) { face = front; mirrored = showBack; }
    // 회전 중심: 그림 범위 가운데
    const bb = alphaBounds(face, borrow, release) ?? { x0: 0, y0: 0, x1: W, y1: H };
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const span = vert ? (bb.x1 - bb.x0) : (bb.y1 - bb.y0);
    const lift = 1 + clamp(p.lift ?? 0.5, 0, 1) * 0.12 * sinA;
    const persp = clamp(p.persp ?? 0.5, 0, 1) * 0.35 * sinA;
    const sgn = showBack ? -1 : 1;
    const k = Math.abs(cosA);
    const STEP = 2;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 그림자(카드 아래로 퍼진 어두운 자국)
    const sh = clamp(p.shadow ?? 0.4, 0, 1) * sinA;
    if (sh > 0.01) {
      ctx.globalAlpha = 0.45 * sh;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(pad + cx, pad + (vert ? bb.y1 : cy) + 12 * sinA, (vert ? span * k / 2 : (bb.x1 - bb.x0) / 2) * lift, 10 + 14 * sinA, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 띠마다 그리기(원근: 띠 위치에 따라 높이를 키우고 줄임)
    const tmp = borrow(W, H);
    const tc = tmp.getContext('2d');
    if (vert) {
      for (let x = Math.floor(bb.x0); x < bb.x1; x += STEP) {
        const u = (x - cx) / Math.max(1, span);                 // -0.5 ~ 0.5
        const sx = mirrored ? 2 * cx - x - STEP : x;
        const dx = cx + (x - cx) * k * lift;
        const hs = (1 + persp * u * 2 * sgn) * lift;
        tc.drawImage(face, sx, 0, STEP, H, dx, cy - cy * hs, STEP * k * lift + 0.6, H * hs);
      }
    } else {
      for (let y = Math.floor(bb.y0); y < bb.y1; y += STEP) {
        const u = (y - cy) / Math.max(1, span);
        const sy = mirrored ? 2 * cy - y - STEP : y;
        const dy = cy + (y - cy) * k * lift;
        const ws = (1 + persp * u * 2 * sgn) * lift;
        tc.drawImage(face, 0, sy, W, STEP, cx - cx * ws, dy, W * ws, STEP * k * lift + 0.6);
      }
    }
    // 뒷면이 없으면 어둡게, 광택은 지나가는 밝은 띠
    if (mirrored) { tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = 'rgba(0,0,0,0.35)'; tc.fillRect(0, 0, W, H); }
    const gl = clamp(p.gloss ?? 0.5, 0, 1) * sinA;
    if (gl > 0.01) {
      tc.globalCompositeOperation = 'source-atop';
      const pos = (vert ? bb.x0 : bb.y0) + (t * 1.4 - 0.2) * span;
      const g = vert ? tc.createLinearGradient(pos - span * 0.25, 0, pos + span * 0.25, 0) : tc.createLinearGradient(0, pos - span * 0.25, 0, pos + span * 0.25);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.55 * gl})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      tc.fillStyle = g; tc.fillRect(0, 0, W, H);
    }
    ctx.drawImage(tmp, pad, pad);
    ctx.restore();
    release(tmp);
  },
};
