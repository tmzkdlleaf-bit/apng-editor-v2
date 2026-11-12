// 반복(loop) 모션 14종(R27: 바람 흔들림·기울기 흔들림 추가) — evaluate(0) === evaluate(1)(이음매 매끈). 속도는 정수 바퀴.
import { windBend } from '../core/anim/wind.js';

const TAU = Math.PI * 2;

const CYC = { key: 'cycles', label: '횟수', type: 'number', default: 1, min: 1, max: 8, step: 1 };

const bob = {
  id: 'bob', name: '위아래 둥실', category: '반복', kind: 'loop', defaultLength: 24,
  description: '위아래로 둥실둥실',
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 16, min: 1, max: 100, step: 1 },
    CYC,
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 16, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    return { y: amp * Math.sin(TAU * cyc * t) };
  },
};

const sway = {
  id: 'sway', name: '좌우 흔들', category: '반복', kind: 'loop', defaultLength: 24,
  description: '좌우로 살랑살랑',
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 16, min: 1, max: 100, step: 1 },
    CYC,
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 16, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    return { x: amp * Math.sin(TAU * cyc * t) };
  },
};

const pulse = {
  id: 'pulse', name: '맥박', category: '반복', kind: 'loop', defaultLength: 24,
  description: '크기가 커졌다 돌아온다',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.15, min: 0.01, max: 1, step: 0.01 },
    CYC,
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.15, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    const k = 0.5 - 0.5 * Math.cos(TAU * cyc * t); // 0..1, 양끝 0
    return { scale: 1 + amt * k };
  },
};

const heartbeat = {
  id: 'heartbeat', name: '두근두근', category: '반복', kind: 'loop', defaultLength: 24,
  description: '심장처럼 톡톡 뛴다',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.18, min: 0.01, max: 1, step: 0.01 },
    { key: 'cycles', label: '횟수', type: 'number', default: 2, min: 1, max: 8, step: 1 },
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.18, cyc = Math.max(1, Math.round(p.cycles ?? 2));
    const beat = Math.pow(Math.max(0, Math.sin(TAU * cyc * t)), 5); // 날카로운 박동, 양끝 0
    return { scale: 1 + amt * beat, brightness: amt * 0.5 * beat };
  },
};

const spinLoop = {
  id: 'spin-loop', name: '제자리 회전', category: '반복', kind: 'loop', defaultLength: 24,
  description: '제자리에서 빙글빙글 돈다',
  params: [CYC],
  evaluate(t, p) {
    const cyc = Math.max(1, Math.round(p.cycles ?? 1));
    return { rotation: (360 * cyc * t) % 360 }; // t=1 → 0(=360) 이음매 매끈
  },
};

const wobble = {
  id: 'wobble', name: '흔들 회전', category: '반복', kind: 'loop', defaultLength: 24,
  description: '좌우로 갸우뚱 흔든다',
  params: [
    { key: 'amplitude', label: '각도', type: 'number', default: 10, min: 1, max: 90, step: 1 },
    { key: 'cycles', label: '횟수', type: 'number', default: 2, min: 1, max: 8, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 10, cyc = Math.max(1, Math.round(p.cycles ?? 2));
    return { rotation: amp * Math.sin(TAU * cyc * t) };
  },
};

const breathe = {
  id: 'breathe', name: '숨쉬기', category: '반복', kind: 'loop', defaultLength: 36,
  description: '천천히 부풀었다 가라앉는다',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.08, min: 0.01, max: 0.5, step: 0.01 },
    CYC,
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.08, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    const k = 0.5 - 0.5 * Math.cos(TAU * cyc * t);
    return { scaleY: 1 + amt * k, scaleX: 1 + amt * 0.4 * k };
  },
};

const jellyLoop = {
  id: 'jelly-loop', name: '젤리', category: '반복', kind: 'loop', defaultLength: 24,
  description: '가로세로로 말랑말랑 눌린다',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.15, min: 0.01, max: 0.6, step: 0.01 },
    { key: 'cycles', label: '횟수', type: 'number', default: 2, min: 1, max: 8, step: 1 },
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.15, cyc = Math.max(1, Math.round(p.cycles ?? 2));
    const s = Math.sin(TAU * cyc * t);
    return { scaleX: 1 + amt * s, scaleY: 1 - amt * s };
  },
};

const blink = {
  id: 'blink', name: '깜빡임', category: '반복', kind: 'loop', defaultLength: 24,
  description: '투명도가 깜빡인다',
  params: [
    { key: 'depth', label: '깊이', type: 'number', default: 0.7, min: 0.1, max: 1, step: 0.01 },
    { key: 'cycles', label: '횟수', type: 'number', default: 3, min: 1, max: 12, step: 1 },
  ],
  evaluate(t, p) {
    const depth = p.depth ?? 0.7, cyc = Math.max(1, Math.round(p.cycles ?? 3));
    const k = 0.5 - 0.5 * Math.cos(TAU * cyc * t);
    return { alpha: 1 - depth * k };
  },
};

const glowPulse = {
  id: 'glow-pulse', name: '반짝 맥동', category: '반복', kind: 'loop', defaultLength: 24,
  description: '밝아졌다 어두워지길 반복',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.5, min: 0.05, max: 1, step: 0.01 },
    CYC,
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.5, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    const k = 0.5 - 0.5 * Math.cos(TAU * cyc * t);
    return { brightness: amt * k, scale: 1 + 0.03 * k };
  },
};

const orbit = {
  id: 'orbit', name: '공전', category: '반복', kind: 'loop', defaultLength: 36,
  description: '작은 원을 그리며 돈다',
  params: [
    { key: 'radius', label: '반지름', type: 'number', default: 24, min: 2, max: 150, step: 1 },
    CYC,
  ],
  evaluate(t, p) {
    const r = p.radius ?? 24, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    return { x: r * Math.sin(TAU * cyc * t), y: r * (1 - Math.cos(TAU * cyc * t)) };
  },
};

const drift = {
  id: 'drift', name: '떠다님', category: '반복', kind: 'loop', defaultLength: 48,
  description: '8자를 그리며 느리게 떠다닌다',
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 20, min: 2, max: 120, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 20;
    return { x: amp * Math.sin(TAU * t), y: amp * 0.5 * Math.sin(TAU * 2 * t) };
  },
};

// R27 — 풀·수풀용. 고정할 쪽(아래: 풀·꽃 / 위: 등불·덩굴처럼 매달린 것).
const ANCHOR = { key: 'anchor', label: '고정할 쪽', type: 'select', default: 'bottom',
  options: [{ value: 'bottom', label: '아래(풀·꽃)' }, { value: 'top', label: '위(매달린 것)' }] };
const GUST = { key: 'gust', label: '돌풍', type: 'number', default: 0, min: 0, max: 1, step: 0.05 };
const SEED = { key: 'seed', label: '시드', type: 'number', default: 1, min: 1, max: 999, step: 1 };

// 바람 흔들림 — 레이어를 가로 띠로 나눠 띠마다 밀어 휜다(뿌리는 그대로, 끝만 휜다). 이미지 레이어에서 동작.
const windSway = {
  id: 'wind-sway', name: '바람 흔들림', category: '반복', kind: 'loop', defaultLength: 36,
  description: '뿌리는 그대로, 끝으로 갈수록 휘며 흔들린다(풀·꽃·덩굴). 그림 레이어 하나에 바로',
  params: [
    { key: 'strength', label: '세기', type: 'number', default: 16, min: 0, max: 200, step: 1 },
    { key: 'curve', label: '휘는 정도', type: 'number', default: 1.6, min: 0.5, max: 4, step: 0.1 },
    { key: 'lag', label: '엇박자', type: 'number', default: 0.4, min: 0, max: 2, step: 0.05 },
    GUST,
    ANCHOR,
    CYC,
    { key: 'bands', label: '띠 수', type: 'number', default: 48, min: 8, max: 128, step: 1 },
    SEED,
  ],
  evaluate(t, p) {
    const n = Math.max(8, Math.min(128, Math.round(p.bands ?? 48)));
    const top = (p.anchor ?? 'bottom') === 'top';
    const o = { cycles: p.cycles ?? 1, curve: p.curve ?? 1.6, lag: p.lag ?? 0.4, gust: p.gust ?? 0, seed: p.seed ?? 1 };
    const amp = p.strength ?? 16;
    const slices = [];
    for (let i = 0; i < n; i++) {
      const mid = (i + 0.5) / n;
      const h = top ? mid : 1 - mid;
      slices.push({ y0: i / n, y1: (i + 1) / n, dx: 0, dxPx: amp * windBend(h, t, o), clipX: false });
    }
    return { slices };
  },
};

// 기울기 흔들림 — 고정점(아래/위 끝)을 기준으로 비스듬히 기울었다 돌아온다. 가장 가볍다(모든 레이어 종류).
const windSkew = {
  id: 'wind-skew', name: '기울기 흔들림', category: '반복', kind: 'loop', defaultLength: 36,
  description: '아래(또는 위) 끝을 고정하고 비스듬히 기울며 흔들린다. 가장 가볍고 단순',
  params: [
    { key: 'strength', label: '세기(도)', type: 'number', default: 8, min: 0, max: 45, step: 0.5 },
    GUST,
    ANCHOR,
    CYC,
    SEED,
  ],
  evaluate(t, p) {
    const top = (p.anchor ?? 'bottom') === 'top';
    const v = (p.strength ?? 8) * windBend(1, t, { cycles: p.cycles ?? 1, curve: 1, lag: 0, gust: p.gust ?? 0, seed: p.seed ?? 1 });
    return { skewX: top ? -v : v, skewPivot: top ? 0 : 1 };
  },
};

export default [bob, sway, pulse, heartbeat, spinLoop, wobble, breathe, jellyLoop, blink, glowPulse, orbit, drift, windSway, windSkew];
