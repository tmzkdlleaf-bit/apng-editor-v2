// 불꽃 — 아래에서 타오르는 불길. 결정론·루프(정수 바퀴). 시드 의존. (분류: 연출)
// R29b 그림체 3종: 손그림(셀) / 반실사(노이즈 불길 + 단계 색) / 실사(노이즈 불길 + 연속 흑체색 + 불티 잔상).
// R29 손그림 개편(docs/vfx-reference-guide.md 4장 "불"):
//   S자로 휘는 혀 모양 불길을 3단 색(속·몸통·가장자리)으로 겹쳐 그리는 셀 방식,
//   크기 3단계, 위로 떨어져 나가는 물방울 불씨, 2프레임 홀드, 은은한 빛 번짐.
import { TAU, frac, clamp, parseColor, mix, drawField, hash2 } from './_fx-util.js';
import { world, cyclesInLoop, emit, integrate, overLife, rgbStr, streak, camera, WORLD_PARAMS, fireTemp, firePhoto, erode, ridge } from './_fx-real.js';
import { sizeTier, gauss, holdFrame, HOLD_PARAM, LOOK_PARAM, lookOf, holdOf, loopFbm, loopNoise, makeRamp, teardropPath, withDiffusion, DIFFUSION_PARAM } from './_fx-style.js';

// 불길 혀 하나: 바닥(x, base) 에서 위로 th 만큼. sway 는 끝의 옆 흔들림(S자·갈고리 모양을 만든다).
function tongue(ctx, x, base, wd, th, sway, lean) {
  const tipX = x + sway, tipY = base - th;
  ctx.moveTo(x - wd, base);
  // 왼쪽 옆선: 아래는 불룩, 위로 갈수록 끝 쪽으로 감긴다
  ctx.bezierCurveTo(x - wd * 1.05, base - th * 0.42, x - wd * 0.15 + lean * wd, base - th * 0.62, tipX, tipY);
  // 오른쪽 옆선: 왼쪽과 일부러 다르게(비대칭)
  ctx.bezierCurveTo(x + wd * 0.45 + sway * 0.55, base - th * 0.5, x + wd * 1.1, base - th * 0.3, x + wd, base);
  ctx.closePath();
}

// 반실사·실사: 열(heat) 지도를 작은 칸 격자에서 계산해 색 램프로 칠한다.
//   열 = (혀들이 만든 바닥 분포) − (높이) + 위로 흐르는 노이즈(루프 주기 노이즈 → 0프레임 = N프레임).
// R30 실사(docs/vfx-guide-real.md 4-1 불): 불 크기로 깜빡임 빠르기 결정(f = 1.68/√D), 온도색(흑체),
//   뒤쪽 그을음 연기 층, 식으며 색이 바뀌는 불티(셔터 흐림), 촬영 마무리(빛 번짐·입자감).
// 온도 → 카메라에 찍힌 색. 흑체 색 × 복사량(∝T⁴)을 노출 곡선(1-e^-x)에 넣는다.
//   뜨거운 바닥은 노출이 넘쳐 노랑빛 흰색으로 날아가고, 식은 끝은 어두운 빨강(실제 사진과 같은 모습).
export function exposeTemp(T, exposure = 1.2) {
  // R31: 흑체 근사 대신 실제 불 사진 10장의 밝기별 색(FIRE_PHOTO)에 맞춘다(docs/vfx-research-2.md 1-2).
  return fireTemp(T, exposure / 1.2);
}

function drawLogs(c, w, h, T, seed) {
  const big = T.slice().sort((a, b) => b.k - a.k).slice(0, Math.min(4, T.length));
  const n = Math.max(2, big.length);
  const thick = Math.max(8, Math.min(w, h) * 0.05);
  for (let i = 0; i < n; i++) {
    const t = big[i % big.length];
    const r1 = hash2(i, 3, seed), r2 = hash2(i, 7, seed);
    const cx = t.bx * w + (r1 - 0.5) * t.wd, cy = h - thick * (0.6 + r2 * 0.8);
    const len = Math.max(w * 0.18, t.wd * 3) * (0.8 + r2 * 0.5);
    const ang = (i % 2 ? 1 : -1) * (0.12 + 0.25 * r1);
    c.save();
    c.translate(cx, cy); c.rotate(ang);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#0d0705';
    c.beginPath(); c.roundRect(-len / 2, -thick / 2, len, thick, thick / 2); c.fill();
    const g = c.createLinearGradient(0, -thick / 2, 0, thick * 0.1);
    g.addColorStop(0, 'rgba(255,110,30,0.55)'); g.addColorStop(0.35, 'rgba(150,40,10,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fill();
    c.restore();
  }
}

function renderReal(ctx, env, p, o) {
  const { w, h, borrow, release, scale = 1 } = env;
  const { T, height, cCore, cBody, cEdge, op, emb } = o;
  const W = world(env, p);
  const turb = clamp(p.turbulence ?? 0.6, 0, 1);
  const useTemp = (p.palette ?? 'temp') === 'temp';
  // 불 크기(m): 불 폭 ≈ 높이 × 0.6 (지름 근사)
  const D = Math.max(0.03, (height / W.pxPerM) * 0.6);
  const fHz = 1.68 / Math.sqrt(D);
  const fMax = W.fps / 2.5;                    // 프레임으로 그릴 수 있는 한계(지침 5-3)
  const fEff = Math.min(fHz, fMax);
  const amp = fHz > fMax ? fMax / fHz : 1;     // 한계보다 빠르면 출렁임은 작게(흐림으로 대신)
  const cycles = cyclesInLoop(1 / fEff, W.L);
  const prog = W.t / W.L;
  const P = 3;
  const flow = prog * P * cycles;              // 깜빡임 한 번에 노이즈 한 주기 위로 — 정수배라 루프 이음매 없음
  const seed = Math.floor(T[0].ph[0] * 1000);
  const cols = Math.max(24, Math.min(170, Math.round(w * scale / 3)));
  const rows = Math.max(24, Math.min(180, Math.round(h * scale / 3)));
  const puff = 1 + 0.14 * amp * Math.sin(prog * Math.PI * 2 * cycles + seed); // 불 전체가 오르내림(퍼핑)
  const hf = (height * puff) / h;
  const base = new Float32Array(cols);
  for (let gx = 0; gx < cols; gx++) {
    const u = (gx + 0.5) / cols;
    let b = 0;
    for (const t of T) { const d = (u - t.bx) / Math.max(0.015, (t.wd / w) * 0.9); b = Math.max(b, t.k * Math.exp(-d * d)); }
    base[gx] = Math.max(b, 0.12);
  }
  let maxB = 0; for (const v of base) maxB = Math.max(maxB, v);
  // 온도색 표(256칸) — 칸마다 흑체·노출 계산을 반복하지 않게
  const ramp = useTemp ? null : makeRamp([[0, cEdge], [0.25, cEdge], [0.55, cBody], [0.9, cCore], [1, cCore]]);
  // R31 셀: 사진 측정 반영 — ① 가장자리 침식으로 몇 px 만에 끊기게(사진 전환 폭 ≈3px)
  //   ② 몸통은 밝게, 끝으로 갈수록 식는다 ③ 능선 노이즈로 접힌 띠의 밝은 선 ④ 높이 따라 커지는 옆 비틀림.
  const soft = 0.07;
  const cell = (gx, gy) => {
    const u = (gx + 0.5) / cols, vy = (gy + 0.5) / rows;
    const hy = (1 - vy) / hf;
    if (hy > maxB * 1.6) return null;
    const wx = loopNoise(u * 3, hy * 2 + flow * 0.5, 0, P * 2, seed + 7) - 0.5;
    const wx2 = loopNoise(u * 7 + 3, hy * 4 + flow, 0, P * 2, seed + 13) - 0.5;
    const ux = clamp(Math.round((u + (wx * 0.16 + wx2 * 0.05) * hy * turb) * cols - 0.5), 0, cols - 1);
    const b = base[ux];
    const sx = u * 15 * (w / Math.max(w, h)) + wx * 3 + wx2 * 2;
    const n = loopFbm(sx, hy * 2 + flow, 0, P, seed, 4);
    const r = hy / b;
    // 갈라짐: 오를수록 가는 어두운 틈이 띠를 쪼갠다 → 떨어져 나가는 혀
    const crack = Math.pow(ridge(loopNoise(sx * 1.3 + 5, hy * 3 + flow * 2, 0, P * 2, seed + 31)), 8);
    const heat = 1 - Math.pow(r, 1.3) + (n - 0.5) * (0.7 + 1.1 * turb) * (0.25 + r) - crack * 0.55 * clamp(r * 1.4, 0, 1);
    if (heat <= 0) return null;
    const e = erode(heat, 0.02, soft);                       // 가장자리: 좁은 폭에서 0→1
    if (e <= 0) return null;
    const fold = Math.pow(ridge(loopNoise(sx * 0.8 + 11, hy * 2.2 + flow * 1.5, 0, P * 2, seed + 21)), 6);
    const core = clamp(heat * 1.15, 0, 1);
    const cool = clamp(r * 0.9 - 0.25, 0, 0.55);             // 혀 끝일수록 식는다(주황→빨강)
    let v = e * (0.42 + 0.5 * Math.pow(core, 0.9)) * (1 - cool) + fold * 0.22 * e;
    const a0 = op * e;
    if (useTemp) {
      const ex = firePhoto(v);
      return [ex[0], ex[1], ex[2], a0 * ex[3]];
    }
    const col = ramp(clamp(v, 0, 1));
    return [col[0], col[1], col[2], a0];
  };
  const tw = (t) => t.bx * w;
  camera(ctx, env, p, (c) => {
    // 1) 그을음 연기(뒤): 불 끝에서 태어나 부력으로 오르며 2~3배로 커지고 옅어진다. 가장 오래 산다.
    emit({ count: Math.round(5 + T.length * 0.5), life: [1.6, 3.2], seed: seed + 3 }, W.t, W.L, (i, age, u, R) => {
      const t = T[Math.floor(R(1) * T.length)];
      const x = tw(t) + (R(2) - 0.5) * t.wd + Math.sin(age * 1.3 + R(3) * 6) * 0.08 * W.pxPerM;
      const y = h - height * t.k * (0.8 + 0.2 * R(4)) - (0.35 + 0.35 * R(5)) * W.pxPerM * age;
      const rad = (0.12 + 0.1 * R(6)) * D * W.pxPerM * (1 + 2 * u);
      const a = op * 0.22 * overLife([[0, 0], [0.15, 1], [0.6, 0.6], [1, 0]], u);
      if (a < 0.005) return;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(58,52,50,${a})`); g.addColorStop(0.6, `rgba(48,44,44,${a * 0.6})`); g.addColorStop(1, 'rgba(40,38,40,0)');
      c.globalAlpha = 1; c.fillStyle = g;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    });
    // 2) 불길(온도 필드)
    drawField(c, w, h, cols, rows, borrow, release, cell);
    // 2-1) R31 장작: 앞을 가리는 검은 실루엣이 깊이감을 만든다(사진 관찰). 윗면만 불빛을 받아 붉게.
    if ((p.fuel ?? 'none') === 'logs') drawLogs(c, w, h, T, seed);
    // 3) 불티: 위로 튀었다가 저항으로 느려지고, 식으며 흰 → 노랑 → 주황 → 빨강. 셔터 흐림 꼬리.
    c.save();
    c.globalCompositeOperation = 'lighter';
    emit({ count: Math.round(T.length * 0.9 * emb), life: [0.7, 1.8], gap: 0.4, seed: seed + 5 }, W.t, W.L, (i, age, u, R) => {
      const t = T[Math.floor(R(1) * Math.min(T.length, 8))];
      const m = integrate(0, 0, (R(2) - 0.5) * 1.2, -(1.2 + 2.2 * R(3)), 0, -0.6, 1.4, age);
      const x = tw(t) + (R(4) - 0.5) * t.wd * 0.8 + m.x * W.pxPerM + Math.sin(age * 4 + R(5) * 6) * 0.03 * W.pxPerM;
      const y = h - height * t.k * 0.35 * R(6) + m.y * W.pxPerM;
      const ex = exposeTemp(1950 - 1050 * u);
      const a = op * overLife([[0, 0], [0.04, 1], [0.7, 0.8], [1, 0]], u) * ex[3];
      if (a < 0.01) return;
      streak(c, x, y, m.vx * W.pxPerM, m.vy * W.pxPerM, W, Math.max(0.8, 1.6 * (1 - u * 0.5)), rgbStr(ex), a);
    });
    c.restore();
  }, { bloomK: 1.3 });
}

function renderField(ctx, env, p, o) {
  const { w, h, borrow, release, scale = 1 } = env;
  const { look, T, E, progress, height, speed, cCore, cBody, cEdge, op } = o;
  const real = look === 'real';
  const turb = clamp(p.turbulence ?? 0.6, 0, 1);
  const cols = Math.max(24, Math.min(150, Math.round(w * scale / 3.5)));
  const rows = Math.max(24, Math.min(160, Math.round(h * scale / 3.5)));
  const hf = height / h;                       // 화면 높이 대비 불 높이
  const P = 4;                                 // 노이즈 세로 주기(칸) — 진행 1바퀴에 P*speed 만큼 흐름
  const flow = progress * P * speed;
  const seed = Math.floor(T[0].ph[0] * 1000);
  // 색 램프: 투명 → 가장자리(어두운 붉은) → 몸통 → 속 → (실사만) 거의 흰빛
  const dm = mix(cEdge, '#1a0505', 0.35);
  const hx = (v) => v.toString(16).padStart(2, '0');
  const deep = `#${hx(dm.r)}${hx(dm.g)}${hx(dm.b)}`; // makeRamp 은 #hex 만 읽는다
  const ramp = makeRamp(real
    ? [[0, deep], [0.2, cEdge], [0.5, cBody], [0.88, cCore], [1, '#fff8e0']]
    : [[0, cEdge], [0.12, cEdge], [0.45, cBody], [0.88, cCore], [1, cCore]]);
  // 바닥 분포(열의 근원): 혀마다 가우시안 언덕. 칸 x 별로 미리 계산.
  const base = new Float32Array(cols);
  for (let gx = 0; gx < cols; gx++) {
    const u = (gx + 0.5) / cols;
    let b = 0;
    for (const t of T) { const d = (u - t.bx) / Math.max(0.015, (t.wd / w) * 0.9); b = Math.max(b, t.k * Math.exp(-d * d)); }
    base[gx] = Math.max(b, 0.12); // 바닥은 이어지고 끝만 갈라지게
  }
  let maxB = 0; for (const v of base) maxB = Math.max(maxB, v);
  const field = (c) => drawField(c, w, h, cols, rows, borrow, release, (gx, gy) => {
    const u = (gx + 0.5) / cols, vy = (gy + 0.5) / rows;
    const hy = (1 - vy) / hf;                  // 0 바닥 ~ 1 불 높이
    if (hy > maxB * 1.6) return null;
    // 휘어진 좌표(도메인 왜곡): 위로 갈수록 옆으로 크게 흔들림
    const wx = loopNoise(u * 3, hy * 2 + flow * 0.5, 0, P * 2, seed + 7) - 0.5;
    const ux = clamp(Math.round((u + wx * 0.12 * hy * turb) * cols - 0.5), 0, cols - 1);
    const b = base[ux];
    // 세로로 길쭉한 노이즈(가로 촘촘·세로 성김) → 불길이 혀처럼 갈라진다. 위로 흐름(flow).
    const n = loopFbm(u * 10 * (w / Math.max(w, h)) + wx * 2, hy * 1.5 + flow, 0, P, seed, 3);
    const r = hy / b;                            // 이 기둥의 불 높이 대비 위치
    const heat = 1 - Math.pow(r, 1.3) + (n - 0.5) * (0.7 + 1.1 * turb) * (0.25 + r);
    if (heat <= 0) return null;
    const a = clamp(heat / 0.08, 0, 1);
    const v = Math.pow(clamp(heat * 1.1, 0, 1), real ? 1.6 : 1.3);
    const col = real ? ramp(v) : ramp(v, 0.2);
    return [col[0], col[1], col[2], a * op];
  });
  withDiffusion(ctx, env, clamp(p.diffusion ?? 0.45, 0, 1) * op * 0.6, Math.max(w, h) * 0.08, (c) => {
    field(c);
    // 불티: 실사는 빛나는 작은 점 + 짧은 잔상(움직임 흐림), 반실사는 작은 물방울
    c.save();
    if (real) c.globalCompositeOperation = 'lighter';
    for (const e of E) {
      const t = frac(e.ph + progress * e.spd);
      if (t > 0.92) continue;
      const pos = (tt) => [e.src.bx * w + e.drift * w * 0.05 * tt + Math.sin(tt * TAU + e.ph * TAU) * w * 0.012, h - height * e.src.k * (0.45 + tt * 0.9)];
      const [x, y] = pos(t);
      const life = 1 - t * t;
      const flick = 0.6 + 0.4 * Math.sin((t * 7 + e.ph) * TAU);
      if (real) {
        const [px, py] = pos(Math.max(0, t - 0.06));
        const r = Math.max(0.6, e.r0 * 0.35 * (1 - t * 0.6));
        c.strokeStyle = cBody; c.lineCap = 'round'; c.lineWidth = r * 1.4;
        c.globalAlpha = op * life * flick * 0.8;
        c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
        c.fillStyle = cCore;
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      } else {
        const r = e.r0 * 0.7 * (1 - t * 0.75);
        c.globalAlpha = op * life;
        c.fillStyle = t < 0.5 ? cBody : cEdge;
        c.beginPath(); teardropPath(c, x, y, r, r * 2.2, Math.PI / 2 + e.drift * 0.3, e.drift * 0.4); c.fill();
      }
    }
    c.restore();
  }, 0.15);
}

export default {
  id: 'flame',
  name: '불꽃',
  category: '연출',
  description: '아래에서 타오르는 불길(손그림 셀 방식)',
  thumbnail: { frame: 10, bg: '#140600' },
  bleed: 8,
  params: [
    { key: 'height', label: '높이', type: 'float', default: 0.6, min: 0.1, max: 1, step: 0.01 },
    { key: 'tongues', label: '불꽃 수', type: 'int', default: 18, min: 3, max: 80 },
    { key: 'speed', label: '타오르는 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '속 색', type: 'color', default: '#fff4b8' },
    { key: 'color2', label: '몸통 색', type: 'color', default: '#ff7a1a' },
    { key: 'color3', label: '가장자리 색', type: 'color', default: '#b3123e' },
    { key: 'embers', label: '불씨', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    LOOK_PARAM('real'),
    { key: 'palette', label: '불 색(실사)', type: 'select', default: 'temp', options: [{ value: 'temp', label: '실제 온도색' }, { value: 'custom', label: '지정한 색' }] },
    { key: 'fuel', label: '장작(실사)', type: 'select', default: 'none', options: [{ value: 'none', label: '없음' }, { value: 'logs', label: '앞을 가리는 장작' }] },
    { key: 'turbulence', label: '일렁임', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    HOLD_PARAM('auto'),
    DIFFUSION_PARAM(0.45),
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
    ...WORLD_PARAMS,
  ],
  presets: [
    { id: 'fire', label: '주황 불', values: { color: '#fff4b8', color2: '#ff7a1a', color3: '#b3123e', palette: 'temp' } },
    { id: 'blue', label: '푸른 불', values: { color: '#e8fdff', color2: '#3a9bff', color3: '#3b2a9e', palette: 'custom' } },
    { id: 'poison', label: '독 불', values: { color: '#f0ffc8', color2: '#52d15e', color3: '#17675e', palette: 'custom' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    const { f, frameCount, w, h, rng } = env;
    const height = clamp(p.height ?? 0.6, 0.1, 1) * h;
    const n = Math.max(3, Math.round(p.tongues ?? 18));
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const cCore = p.color ?? '#fff4b8', cBody = p.color2 ?? '#ff7a1a', cEdge = p.color3 ?? '#b3123e';
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const look = lookOf(p);
    const hold = holdOf(p, look);
    const progress = holdFrame(f, hold, frameCount) / Math.max(1, frameCount);
    const emb = clamp(p.embers ?? 0.6, 0, 1);

    // 혀마다 고정 성질(결정론). 크기 3단계 — 큰 것 몇 개가 덩어리를 이끌고 작은 것들이 사이를 채운다.
    const T = [];
    for (let i = 0; i < n; i++) {
      const st = sizeTier(rng, [0.2, 0.35]);
      const k = 0.35 + st.k * 0.65;
      // 가운데로 조금 몰리게(가우시안 섞기) — 화면 전체에 고르게 깔리지 않게
      const bx = rng() < 0.6 ? clamp(0.5 + gauss(rng) * 0.6, -0.05, 1.05) : -0.05 + rng() * 1.1;
      const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
      const spd = speed + Math.floor(rng() * 2);
      T.push({ bx, k, ph, spd, wd: (0.05 + rng() * 0.04) * w * (0.6 + k * 0.8), lean: (rng() - 0.5) * 0.6 });
    }
    const S = T.map((t) => {
      const a = progress * TAU * t.spd;
      // 주기 3종을 섞어 "일정한 맥박"이 아니게(지침 3-2 리듬). 전부 정수배 → 루프 유지.
      const nrm = 0.55 * Math.sin(a + t.ph[0]) + 0.3 * Math.sin(a * 2 + t.ph[1]) + 0.15 * Math.sin(a * 3 + t.ph[2]);
      const th = height * t.k * (0.78 + 0.22 * nrm);
      const sway = (Math.sin(a + t.ph[1]) * 0.9 + Math.sin(a * 2 + t.ph[2]) * 0.35) * t.wd * 1.4;
      return { th, sway, x: t.bx * w };
    });
    // 불씨 성질도 미리 뽑아 둔다(그리기 콜백 밖에서 rng 순서 고정)
    const m = Math.round(T.length * 0.5 * emb);
    const big = Math.min(T.length, 6);
    const order = T.map((t, i) => i).sort((a, b) => T[b].k - T[a].k);
    const E = [];
    for (let i = 0; i < m; i++) {
      E.push({ src: T[order[Math.floor(rng() * big)]], ph: rng(), spd: speed + 1 + Math.floor(rng() * 2), drift: (rng() - 0.5) * 2, r0: (2 + rng() * 3.5) * Math.max(w, h) / 220 });
    }

    if (look === 'real') { renderReal(ctx, env, p, { T, height, cCore, cBody, cEdge, op, emb }); return; }
    if (look !== 'cel') { renderField(ctx, env, p, { look, T, E, progress, height, speed, cCore, cBody, cEdge, op }); return; }
    withDiffusion(ctx, env, clamp(p.diffusion ?? 0.45, 0, 1) * op, Math.max(w, h) * 0.06, (c) => {
      c.globalAlpha = op;
      // 1) 가장자리(가장 크고, 색조를 옮긴 어두운 색) → 2) 몸통 → 3) 속(흰빛). 단마다 딱딱한 경계.
      const bands = [[cEdge, 1, 1, 0], [cBody, 0.82, 0.8, 0.03], [cCore, 0.5, 0.42, 0.14]];
      for (const [col, kw, kh, drop] of bands) {
        c.fillStyle = col;
        c.beginPath();
        for (let i = 0; i < T.length; i++) {
          const t = T[i], s = S[i];
          tongue(c, s.x, h + h * 0.02 + drop * height * 0.25, t.wd * kw, s.th * kh, s.sway * kh, t.lean);
        }
        c.fill();
      }

      // 4) 떨어져 나가는 물방울 불씨 — 위로 오르며 작아지고 몸통색 → 가장자리색으로.
      for (const e of E) {
        const t = frac(e.ph + progress * e.spd);
        if (t > 0.92) continue;
        const y = h - height * e.src.k * (0.45 + t * 0.9);
        const x = e.src.bx * w + e.drift * w * 0.05 * t + Math.sin(t * TAU + e.ph * TAU) * w * 0.012;
        const r = e.r0 * (1 - t * 0.75);
        c.fillStyle = t < 0.6 ? cBody : cEdge;
        c.globalAlpha = op * (1 - t * t);
        c.beginPath();
        teardropPath(c, x, y, r, r * 2.4, Math.PI / 2 + e.drift * 0.3, e.drift * 0.5); // 꼬리는 아래(오르는 반대쪽)
        c.fill();
        if (t < 0.3 && r > 1.6) { // 갓 떨어진 것만 흰 속
          c.fillStyle = cCore;
          c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1;
    });
  },
};
