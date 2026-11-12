// 홀로그램 등장·퇴장(R28d) — 투영되듯 나타나고 사라진다: 가로 줄무늬가 훑고, 깜빡이고, 색이 어긋났다가 맞춰짐.
//   한 번형. 진행 0 = 나가는 화면 그대로, 1 = 들어오는 화면 그대로(없으면 투명). 등장만 하려면 '들어오는 화면'만 연결.
import { clamp, parseColor, hash2, smoothstep, PROGRESS_PARAMS, progressOf, TRANSITION_SOURCES, transitionCanvases, drawPlain } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

// 한 화면을 홀로그램 처리해 그린다. k = 홀로그램 정도(0 = 원래 그대로, 1 = 완전 투영 상태), vis = 보이는 정도.
function _holo(ctx, src, pad, k, vis, o, borrow, release) {
  if (!src || vis <= 0.001) return;
  const W = src.width, H = src.height;
  const tmp = borrow(W, H);
  const tc = tmp.getContext('2d');
  // 색 어긋남: 좌우로 밀린 잔상 두 개를 밝게 더한다(진짜 RGB 분리보다 훨씬 가볍다).
  tc.drawImage(src, 0, 0);
  const off = Math.round(o.chroma * k);
  if (off > 0) {
    tc.globalCompositeOperation = 'lighter';
    tc.globalAlpha = 0.35 * k;
    tc.drawImage(src, off, 0);
    tc.drawImage(src, -off, 0);
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = 'source-over';
  }
  // 기준 색으로 물들이기 + 줄무늬
  tc.globalCompositeOperation = 'source-atop';
  tc.fillStyle = `rgba(${o.col.r},${o.col.g},${o.col.b},${0.55 * k})`;
  tc.fillRect(0, 0, W, H);
  if (k > 0.01) {
    tc.fillStyle = `rgba(0,0,0,${0.45 * k})`;
    for (let y = 0; y < H; y += o.gap) tc.fillRect(0, y, W, Math.max(1, o.gap * 0.45));
  }
  tc.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = vis;
  ctx.drawImage(tmp, pad, pad);
  ctx.globalAlpha = 1;
  release(tmp);
}

export default {
  id: 'holo-transition',
  name: '홀로그램 등장·퇴장',
  category: '전환',
  once: true,
  description: '투영되듯 나타나고 사라진다(줄무늬가 훑고·깜빡이고·색이 어긋났다 맞춰짐)',
  thumbnail: { frame: 6, bg: '#08141a' },
  bleed: 0,
  params: [
    { key: 'color', label: '기준 색', type: 'color', default: '#3ff0e0' },
    { key: 'gap', label: '줄무늬 간격', type: 'float', default: 4, min: 2, max: 16, step: 1 },
    { key: 'flicker', label: '깜빡임 횟수', type: 'int', default: 4, min: 0, max: 12 },
    { key: 'chroma', label: '색 어긋남', type: 'float', default: 6, min: 0, max: 20, step: 0.5 },
    { key: 'sweep', label: '훑는 방향', type: 'select', default: 'down',
      options: [{ value: 'down', label: '위→아래' }, { value: 'up', label: '아래→위' }, { value: 'right', label: '왼쪽→오른쪽' }] },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 16 } : d.key === 'progEase' ? { ...d, default: 'linear' } : d),
  ],
  scopes: ['full'],
  sources: TRANSITION_SOURCES,
  render(ctx, { f, rng, sources, pad = 0, scale = 1, borrow, release }, p) {
    const { out, inn } = transitionCanvases(sources);
    const t = progressOf(f, p, ease);
    if (t <= 0) { drawPlain(ctx, out, pad); return; }
    if (t >= 1) { drawPlain(ctx, inn, pad); return; }
    const seed = 1 + Math.floor(rng() * 9999);
    const base = out ?? inn;
    const W = base.width, H = base.height;
    const o = { col: parseColor(p.color ?? '#3ff0e0'), gap: Math.max(2, Math.round((p.gap ?? 4) * scale)), chroma: (p.chroma ?? 6) * scale };
    // 깜빡임: 진행 구간을 나눠 몇 칸은 어둡게(결정론)
    const nf = Math.max(0, Math.round(p.flicker ?? 4));
    let flick = 1;
    if (nf > 0) { const cell = Math.floor(t * nf * 3); if (hash2(cell, 1, seed) < 0.35) flick = 0.35 + 0.3 * hash2(cell, 2, seed); }
    const sweep = p.sweep ?? 'down';
    // 훑는 선 위치(0~1)를 기준으로 들어오는 화면은 훑고 지나간 쪽에만, 나가는 화면은 아직 안 지나간 쪽에만
    const sw = t;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const clipRect = (passed) => {
      ctx.beginPath();
      if (sweep === 'right') { const x = sw * W; passed ? ctx.rect(pad, pad, x, H) : ctx.rect(pad + x, pad, W - x, H); }
      else if (sweep === 'up') { const y = (1 - sw) * H; passed ? ctx.rect(pad, pad + y, W, H - y) : ctx.rect(pad, pad, W, y); }
      else { const y = sw * H; passed ? ctx.rect(pad, pad, W, y) : ctx.rect(pad, pad + y, W, H - y); }
    };
    // 나가는 화면: 아직 안 지나간 쪽, 홀로그램 정도는 진행만큼 커짐
    ctx.save(); clipRect(false); ctx.clip();
    _holo(ctx, out, pad, smoothstep(0, 0.6, t), (1 - t * 0.6) * flick, o, borrow, release);
    ctx.restore();
    // 들어오는 화면: 지나간 쪽, 홀로그램 정도는 진행에 따라 줄어 끝에서 원래대로
    ctx.save(); clipRect(true); ctx.clip();
    _holo(ctx, inn, pad, 1 - smoothstep(0.4, 1, t), (0.5 + 0.5 * t) * flick, o, borrow, release);
    ctx.restore();
    // 훑는 밝은 선
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${o.col.r},${o.col.g},${o.col.b},${0.8 * (1 - Math.abs(t - 0.5) * 1.2)})`;
    if (sweep === 'right') ctx.fillRect(pad + sw * W - 2 * scale, pad, 4 * scale, H);
    else { const y = sweep === 'up' ? (1 - sw) * H : sw * H; ctx.fillRect(pad, pad + y - 2 * scale, W, 4 * scale); }
    ctx.restore();
  },
};
