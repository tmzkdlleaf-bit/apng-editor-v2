// 촛불 일렁임 — 화면 밝기가 촛불처럼 흔들림. 결정론·루프(정수 주파수 사인 합).
import { TAU, withAlpha, clamp } from './_fx-util.js';
import { LOOK_PARAM, lookOf, loopNoise } from './_fx-style.js';
import { world, cyclesInLoop, blackbody } from './_fx-real.js';

export default {
  id: 'candle',
  name: '촛불 일렁임',
  category: '빛',
  description: '촛불처럼 화면 밝기가 불규칙하게 흔들린다',
  thumbnail: { frame: 5, bg: '#120a04' },
  bleed: 0,
  params: [
    { key: 'intensity', label: '세기', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'irregularity', label: '불규칙 정도', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색 온도', type: 'color', default: '#ffb15a' },
    { key: 'center', label: '중심', type: 'coord', default: { x: 0.5, y: 0.55 } },
    LOOK_PARAM('real'),
    { key: 'source', label: '불 종류(실사)', type: 'select', default: 'candle',
      options: [{ value: 'candle', label: '촛불 하나' }, { value: 'candles', label: '촛불 여러 개' }, { value: 'campfire', label: '모닥불' }, { value: 'bonfire', label: '큰 화톳불' }] },
    { key: 'palette', label: '빛 색(실사)', type: 'select', default: 'temp', options: [{ value: 'temp', label: '실제 온도색' }, { value: 'custom', label: '지정한 색' }] },
    { key: 'worldHeight', label: '화면 높이(실제 m)', type: 'float', default: 3, min: 0.2, max: 60, step: 0.1, advanced: true },
  ],
  presets: [
    { id: 'warm', label: '따뜻한 촛불', values: { color: '#ffb15a' } },
    { id: 'fire', label: '모닥불', values: { color: '#ff7a2a', intensity: 0.7, irregularity: 0.8, source: 'campfire' } },
  ],
  scopes: ['full'], // 화면 전체 밝기 흔들림 — 박스는 의미가 적어 제외.
  sources: [],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h } = env;
    const intensity = clamp(p.intensity ?? 0.5, 0, 1);
    const irr = clamp(p.irregularity ?? 0.6, 0, 1);
    const color = p.color ?? '#ffb15a';
    const c = p.center ?? { x: 0.5, y: 0.55 };
    const cx = (c.x ?? 0.5) * w, cy = (c.y ?? 0.55) * h;
    const progress = f / Math.max(1, frameCount);
    const t = progress * TAU;
    // 정수 주파수 사인 합 → 루프 유지. 불규칙할수록 높은 주파수 비중 ↑.
    let flick = 0.6 * Math.sin(t) + irr * (0.25 * Math.sin(t * 3 + 1.3) + 0.15 * Math.sin(t * 7 + 2.1));
    flick = 0.78 + 0.22 * flick; // 0.5~1 근처

    const r = Math.max(w, h) * (0.7 + 0.08 * flick);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(color, intensity * flick));
    g.addColorStop(0.55, withAlpha(color, intensity * 0.35 * flick));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  },
};

// R30 실사(자료집 2-1): 촛불 하나는 거의 깜빡이지 않는다(잔잔한 흔들림 + 가끔 바람에 크게 휘청).
//   여러 촛불이 모이면 약 10 Hz 로 출렁이고, 더 큰 불은 f = 1.68/√D 로 느려진다(모닥불 0.5 m ≈ 2.4 Hz).
//   초당 프레임으로 못 그리는 빠르기는 출렁임을 작게(지침 5-3). 빛 색은 불 온도(촛불 약 1850 K).
const SOURCES = { candle: { D: 0, T: 1850, amp: 0.035, draft: 0.18 }, candles: { D: -1, T: 1850, amp: 0.1, draft: 0.12 },
  campfire: { D: 0.5, T: 1450, amp: 0.16, draft: 0.1 }, bonfire: { D: 2, T: 1400, amp: 0.2, draft: 0.08 } };
function renderReal(ctx, env, p) {
  const { w, h } = env;
  const W = world(env, p);
  const src = SOURCES[p.source] ?? SOURCES.candle;
  const intensity = clamp(p.intensity ?? 0.5, 0, 1);
  const irr = clamp(p.irregularity ?? 0.6, 0, 1);
  const c = p.center ?? { x: 0.5, y: 0.55 };
  const cx = (c.x ?? 0.5) * w, cy = (c.y ?? 0.55) * h;
  const fHz = src.D > 0 ? 1.68 / Math.sqrt(src.D) : src.D < 0 ? 10 : 0;
  const fMax = W.fps / 2.5;
  const pr = W.t / W.L;
  let v = 0;
  if (fHz > 0) {
    const cyc = cyclesInLoop(1 / Math.min(fHz, fMax), W.L);
    const amp = src.amp * (fHz > fMax ? fMax / fHz : 1) * (0.5 + irr);
    v += amp * (Math.sin(TAU * cyc * pr) * 0.6 + (loopNoise(pr * cyc * 2, 0.5, cyc * 2, 0, 7) - 0.5) * 0.8);
  }
  // 잔잔한 흔들림(모든 불) + 가끔 바람에 크게 휘청(루프마다 한 번, 0.4초)
  v += src.amp * 0.5 * (loopNoise(pr * 8, 1.5, 8, 0, 3) - 0.5) * (0.5 + irr);
  const dt = ((pr - 0.62) % 1 + 1) % 1 * W.L;
  if (dt < 0.4) v -= src.draft * irr * Math.sin(Math.PI * dt / 0.4);
  const flick = clamp(1 + v, 0.4, 1.3);
  let color = p.color ?? '#ffb15a';
  if ((p.palette ?? 'temp') === 'temp') {
    const e = blackbody(src.T).rgb;           // 비추는 빛의 색 = 불 온도의 흑체색(촛불 ≈ 주황빛)
    color = '#' + e.map((q) => q.toString(16).padStart(2, '0')).join('');
  }
  const r = Math.max(w, h) * (0.7 + 0.05 * (flick - 1));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  // 빛의 세기는 거리 제곱에 반비례에 가깝게 — 가운데가 훨씬 밝다
  g.addColorStop(0, withAlpha(color, intensity * flick));
  g.addColorStop(0.2, withAlpha(color, intensity * 0.55 * flick));
  g.addColorStop(0.55, withAlpha(color, intensity * 0.18 * flick));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}
