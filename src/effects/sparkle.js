// 반짝임 — 별 모양 반짝임이 생겼다 사라짐. 결정론·루프(progress=f/frameCount).
// R29 손그림 개편(docs/vfx-reference-guide.md 4장 "빛"):
//   갈래 길이가 서로 다른 오목한 별(긴 2 + 짧은 2), 2단 색(겉색 + 흰 속),
//   크기 3단계·무리 지어 분포, "빠르게 켜지고 천천히 꺼지는" 깜빡임, 2프레임 홀드, 빛 번짐.
// R29b 그림체: 손그림(위 그대로) / 반실사(별 안쪽이 흰빛→색→투명으로 번짐) / 실사(렌즈에 맺힌 빛: 부드러운 빛점 + 가늘게 사라지는 빛줄기, 더하기 합성).
import { TAU, frac, clamp, withAlpha } from './_fx-util.js';
import { sizeTier, makeClusters, clusterPoint, holdFrame, HOLD_PARAM, LOOK_PARAM, lookOf, holdOf, flick, mixCss, withDiffusion, DIFFUSION_PARAM } from './_fx-style.js';

// 오목한 별: 갈래 끝을 중심 쪽으로 오목하게 휜 곡선으로 잇는다(선 긋기가 아니라 면).
//   lens: 갈래마다 길이 배열, pinch: 허리 굵기(작을수록 뾰족).
function starPath(ctx, x, y, r, lens, rot, pinch) {
  const n = lens.length;
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * TAU;
    const tx = x + Math.cos(a) * r * lens[k], ty = y + Math.sin(a) * r * lens[k];
    const am = a + TAU / n / 2; // 다음 갈래와의 사이
    const cx = x + Math.cos(am) * r * pinch, cy = y + Math.sin(am) * r * pinch;
    const b = rot + ((k + 1) / n) * TAU;
    const nx = x + Math.cos(b) * r * lens[(k + 1) % n], ny = y + Math.sin(b) * r * lens[(k + 1) % n];
    if (k === 0) ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(cx, cy, nx, ny);
  }
  ctx.closePath();
}

export default {
  id: 'sparkle',
  name: '반짝임',
  category: '빛',
  lightBg: true, // R27 밝은 배경용(테두리·진하게) 지원
  description: '별 모양 반짝임이 생겼다 사라진다',
  thumbnail: { frame: 6, bg: '#101826' },
  bleed: 10,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 40, min: 1, max: 400 },
    { key: 'size', label: '크기', type: 'float', default: 10, min: 2, max: 40, step: 0.5 },
    { key: 'speed', label: '깜빡 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#ffd77a' },
    { key: 'shape', label: '모양', type: 'select', default: 'four',
      options: [{ value: 'cross', label: '십자' }, { value: 'four', label: '네 갈래' }, { value: 'six', label: '여섯 갈래' }] },
    LOOK_PARAM('real'),
    HOLD_PARAM('auto'),
    DIFFUSION_PARAM(0.5),
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'gold', label: '금빛', values: { color: '#ffd77a', shape: 'four', size: 10 } },
    { id: 'ice', label: '얼음', values: { color: '#9fdcff', shape: 'six', size: 8 } },
    { id: 'dense', label: '촘촘', values: { count: 160, size: 6, speed: 3 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    const { f, frameCount, w, h, rng } = env;
    const count = Math.max(1, Math.round(p.count ?? 40));
    const size = p.size ?? 10;
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const color = p.color ?? '#ffd77a';
    const core = mixCss(color, '#ffffff', 0.75);
    const shape = p.shape ?? 'four';
    const op = clamp(p.opacity ?? 1, 0, 1);
    const look = lookOf(p);
    const hold = holdOf(p, look);
    const progress = holdFrame(f, hold, frameCount) / Math.max(1, frameCount);

    // 갈래 길이: 길고 짧음을 섞는다(완벽한 대칭 금지)
    const baseLens = shape === 'cross' ? [1, 0.82, 0.95, 0.78]
      : shape === 'six' ? [1, 0.5, 0.85, 0.55, 0.95, 0.48]
      : [1, 0.42, 0.78, 0.45]; // 네 갈래: 세로로 길고 가로로 짧게

    const clusters = makeClusters(rng, 3);
    const S = [];
    for (let i = 0; i < count; i++) {
      const pt = clusterPoint(rng, clusters, 0.3);
      const st = sizeTier(rng, [0.12, 0.38]);
      S.push({
        x: pt.x * w, y: pt.y * h, tier: st.tier,
        r: size * 2.4 * (0.25 + st.k * 0.75),
        ph: rng(), rot: -Math.PI / 2 + (rng() - 0.5) * 0.4, // 거의 세로로 서 있게(±11°)
        spd: speed + (st.tier === 2 ? Math.floor(rng() * 2) : 0), // 작은 것이 더 자주
        on: st.tier === 0 ? 0.6 : 0.75, // 한 주기 중 켜져 있는 비율
      });
    }
    S.sort((a, b) => b.tier - a.tier); // 작은 것(보조) 먼저, 큰 것(주요소) 나중

    withDiffusion(ctx, env, clamp(p.diffusion ?? 0.5, 0, 1) * op, size * 2.5, (c) => {
      for (const s of S) {
        const u = frac(s.ph + progress * s.spd);
        if (u >= s.on) continue;
        const v = look === 'real' ? Math.pow(Math.sin(Math.PI * u / s.on), 2) // 실사: 매끄럽게 차올랐다 잦아듦
          : flick(u / s.on, 0.18); // 빠르게 켜지고 천천히 꺼짐
        if (v <= 0.02) continue;
        // 켜지는 순간 살짝 넘치게(정점 과장 110~125%)
        const over = look === 'cel' && u / s.on < 0.18 ? 1.2 : 1;
        const r = s.r * (0.35 + 0.65 * v) * over;
        if (s.tier === 2 && r < 3) {
          // 아주 작은 것은 점(accent) — 원 허용
          c.globalAlpha = op * v * 0.9;
          c.fillStyle = core;
          c.beginPath(); c.arc(s.x, s.y, Math.max(0.7, r * 0.35), 0, TAU); c.fill();
          continue;
        }
        const al = op * Math.min(1, v * 1.15) * (s.tier === 0 ? 1 : 0.9);
        if (look === 'cel') {
          c.globalAlpha = al;
          c.fillStyle = color;
          c.beginPath(); starPath(c, s.x, s.y, r, baseLens, s.rot, 0.13); c.fill();
          // 흰 속(작은 별) — 2단 셀 색
          c.fillStyle = core;
          c.beginPath(); starPath(c, s.x, s.y, r * 0.6, baseLens, s.rot, 0.16); c.fill();
          c.fillStyle = '#ffffff';
          c.beginPath(); c.arc(s.x, s.y, Math.max(0.8, r * 0.1), 0, TAU); c.fill(); // 가장 뜨거운 한 점만 순백
        } else if (look === 'semi') {
          // 별 모양은 그대로, 안쪽은 흰빛 → 색 → 투명으로 부드럽게
          const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
          g.addColorStop(0, withAlpha('#ffffff', 1)); g.addColorStop(0.12, withAlpha(core, 1));
          g.addColorStop(0.35, withAlpha(color, 1)); g.addColorStop(0.75, withAlpha(color, 0.75)); g.addColorStop(1, withAlpha(color, 0));
          c.globalAlpha = al; c.fillStyle = g;
          c.beginPath(); starPath(c, s.x, s.y, r, baseLens, s.rot, 0.15); c.fill();
          const g2 = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 0.45);
          g2.addColorStop(0, withAlpha(core, 0.55)); g2.addColorStop(1, withAlpha(color, 0));
          c.fillStyle = g2; c.beginPath(); c.arc(s.x, s.y, r * 0.45, 0, TAU); c.fill();
        } else {
          // 렌즈에 맺힌 빛: 더하기 합성. 빛점은 부드럽게, 빛줄기는 끝으로 갈수록 가늘고 옅게.
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = al;
          const gr = r * 0.42;
          const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
          g.addColorStop(0, withAlpha('#ffffff', 1)); g.addColorStop(0.15, withAlpha(core, 0.9));
          g.addColorStop(0.4, withAlpha(color, 0.35)); g.addColorStop(1, withAlpha(color, 0));
          c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, gr, 0, TAU); c.fill();
          const lw = Math.max(0.6, r * 0.045);
          for (let k = 0; k < baseLens.length; k++) {
            const a = -Math.PI / 2 + (k / baseLens.length) * TAU; // 실사 빛줄기는 화면 축에 맞춰 곧게
            const L = r * 1.25 * baseLens[k];
            const ex = s.x + Math.cos(a) * L, ey = s.y + Math.sin(a) * L;
            const lg = c.createLinearGradient(s.x, s.y, ex, ey);
            lg.addColorStop(0, withAlpha(core, 0.95)); lg.addColorStop(0.3, withAlpha(color, 0.5)); lg.addColorStop(1, withAlpha(color, 0));
            c.strokeStyle = lg; c.lineWidth = lw; c.lineCap = 'butt';
            c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(ex, ey); c.stroke();
          }
          c.globalCompositeOperation = 'source-over';
        }
      }
      c.globalAlpha = 1;
    });
  },
};
