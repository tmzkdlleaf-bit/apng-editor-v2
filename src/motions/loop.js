// 반복(loop) 모션 12종 — evaluate(0) === evaluate(1)(이음매 매끈). 속도는 정수 바퀴.
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

export default [bob, sway, pulse, heartbeat, spinLoop, wobble, breathe, jellyLoop, blink, glowPulse, orbit, drift];
