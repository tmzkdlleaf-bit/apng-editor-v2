// 잉크 번짐 전환(R28d) — 잉크 얼룩이 번지며 다음 화면이 드러난다. 번지는 앞쪽에 잉크 색 테두리와 튀는 방울.
//   한 번형. 진행 0 = 나가는 화면 그대로, 1 = 들어오는 화면 그대로.
import { TAU, clamp, parseColor, rgba, fbm, smoothstep, drawField, PROGRESS_PARAMS, progressOf,
  TRANSITION_SOURCES, transitionCanvases, drawPlain, hash2 } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

export default {
  id: 'ink-wipe',
  name: '잉크 번짐 전환',
  category: '전환',
  once: true,
  description: '잉크가 번지며 다음 화면이 드러난다. 시작 점 여러 개·번짐 거칠기·잉크 색',
  thumbnail: { frame: 7, bg: '#1a1a1a' },
  bleed: 0,
  params: [
    { key: 'center', label: '시작 점', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'extra', label: '시작 점 더하기', type: 'int', default: 2, min: 0, max: 6 },
    { key: 'rough', label: '번짐 거칠기', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'color', label: '잉크 색', type: 'color', default: '#0b0b10' },
    { key: 'edge', label: '가장자리 번짐', type: 'float', default: 0.35, min: 0, max: 1, step: 0.05 },
    { key: 'splatter', label: '튀는 방울', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 18 } : d),
  ],
  scopes: ['full'],
  sources: TRANSITION_SOURCES,
  render(ctx, { f, w, h, rng, sources, pad = 0, scale = 1, borrow, release }, p) {
    const { out, inn } = transitionCanvases(sources);
    const t = progressOf(f, p, ease);
    if (t <= 0) { drawPlain(ctx, out, pad); return; }
    if (t >= 1) { drawPlain(ctx, inn, pad); return; }
    const seed = 1 + Math.floor(rng() * 9999);
    const pts = [[clamp(p.center?.x ?? 0.5, 0, 1), clamp(p.center?.y ?? 0.5, 0, 1)]];
    for (let i = 0; i < Math.round(p.extra ?? 2); i++) pts.push([0.1 + 0.8 * rng(), 0.1 + 0.8 * rng()]);
    const asp = w / h;
    const rough = clamp(p.rough ?? 0.5, 0, 1);
    // 값 지도: 가장 가까운 시작 점까지 거리 + 거칠기 노이즈. 문턱(level)이 커지며 번진다.
    const val = (u, v) => {
      let d = 9;
      for (const [x, y] of pts) d = Math.min(d, Math.hypot((u - x) * asp, v - y));
      return d + rough * 0.35 * (fbm(u * 6, v * 6, seed, 3) - 0.5);
    };
    const vmax = Math.hypot(asp, 1) + 0.2;
    const edgeW = 0.02 + 0.12 * clamp(p.edge ?? 0.35, 0, 1);
    const level = -edgeW + (vmax + edgeW * 2) * t;
    const cols = 128, rows = Math.max(8, Math.round(128 / asp));
    const ink = parseColor(p.color ?? '#0b0b10');
    // 값 지도는 한 번만 계산해 두 번 쓴다
    const grid = new Float32Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) grid[gy * cols + gx] = val((gx + 0.5) / cols, (gy + 0.5) / rows);
    const W = (out ?? inn)?.width ?? Math.round(w * scale), H = (out ?? inn)?.height ?? Math.round(h * scale);
    // 들어오는 화면 ∩ 번진 곳
    const reveal = borrow(W, H);
    const rc = reveal.getContext('2d');
    if (inn) rc.drawImage(inn, 0, 0);
    const mask = borrow(W, H);
    const mc = mask.getContext('2d');
    mc.scale(W / w, H / h);
    drawField(mc, w, h, cols, rows, borrow, release, (gx, gy) => {
      const a = 1 - smoothstep(level - 0.01, level + 0.01, grid[gy * cols + gx]);
      return a > 0 ? [0, 0, 0, a] : null;
    });
    rc.globalCompositeOperation = 'destination-in';
    rc.drawImage(mask, 0, 0);
    // 잉크 테두리: level ~ level+edgeW 고리
    const ring = borrow(W, H);
    const gc = ring.getContext('2d');
    gc.scale(W / w, H / h);
    drawField(gc, w, h, cols, rows, borrow, release, (gx, gy) => {
      const v = grid[gy * cols + gx];
      const a = (1 - smoothstep(level + edgeW * 0.6, level + edgeW, v)) * smoothstep(level - 0.01, level + 0.01, v);
      return a > 0.01 ? [ink.r, ink.g, ink.b, a] : null;
    });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (out && inn) ctx.drawImage(out, pad, pad);   // 들어오는 화면이 번진 곳을 덮는다(경계는 섞임)
    else if (out) {
      // 들어오는 화면이 없으면 나가는 화면에서 번진 곳을 지워 투명하게
      const o2 = borrow(W, H); const oc = o2.getContext('2d');
      oc.drawImage(out, 0, 0); oc.globalCompositeOperation = 'destination-out'; oc.drawImage(mask, 0, 0);
      ctx.drawImage(o2, pad, pad); release(o2);
    }
    ctx.drawImage(reveal, pad, pad);
    ctx.drawImage(ring, pad, pad);
    ctx.restore();
    release(reveal); release(mask); release(ring);
    // 튀는 방울: 번지는 앞쪽 근처
    const sp = clamp(p.splatter ?? 0.5, 0, 1);
    if (sp > 0) {
      ctx.fillStyle = rgba(ink, 0.95);
      const n = Math.round(60 * sp);
      for (let i = 0; i < n; i++) {
        const [cx, cy] = pts[i % pts.length];
        const a = hash2(i, 1, seed) * TAU;
        const rr = (level + edgeW * (0.8 + 1.6 * hash2(i, 2, seed))) ;
        if (rr <= 0) continue;
        const x = (cx + Math.cos(a) * rr / asp) * w, y = (cy + Math.sin(a) * rr) * h;
        const s = (1 + 3 * hash2(i, 3, seed)) * (1 - t * 0.5);
        ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
      }
    }
  },
};
