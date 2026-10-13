// 강조(emphasis) 모션 8종 — 한 번 눈에 띄는 동작. t=0·t=1 은 제자리(identity)로 두어
// 어디에 얹어도 앞뒤가 튀지 않는다(spin-once 만 t=1 에 한 바퀴=시각상 제자리).
import { ease } from '../core/anim/easing.js';
const TAU = Math.PI * 2, PI = Math.PI;

const shake = {
  id: 'shake', name: '흔들기', category: '강조', kind: 'emphasis', defaultLength: 12,
  description: '좌우로 부르르 떤다',
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 12, min: 1, max: 100, step: 1 },
    { key: 'cycles', label: '횟수', type: 'number', default: 3, min: 1, max: 12, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 12, cyc = Math.max(1, Math.round(p.cycles ?? 3));
    return { x: amp * Math.sin(TAU * cyc * t) };
  },
};

const nod = {
  id: 'nod', name: '끄덕', category: '강조', kind: 'emphasis', defaultLength: 14,
  description: '위아래로 끄덕인다',
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 14, min: 1, max: 100, step: 1 },
    { key: 'cycles', label: '횟수', type: 'number', default: 2, min: 1, max: 8, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 14, cyc = Math.max(1, Math.round(p.cycles ?? 2));
    return { y: amp * Math.sin(TAU * cyc * t) };
  },
};

const jump = {
  id: 'jump', name: '점프', category: '강조', kind: 'emphasis', defaultLength: 16,
  description: '폴짝 뛰어오른다',
  params: [
    { key: 'height', label: '높이', type: 'number', default: 40, min: 4, max: 200, step: 1 },
    { key: 'cycles', label: '횟수', type: 'number', default: 1, min: 1, max: 5, step: 1 },
  ],
  evaluate(t, p) {
    const hgt = p.height ?? 40, cyc = Math.max(1, Math.round(p.cycles ?? 1));
    const arc = Math.abs(Math.sin(PI * cyc * t)); // 양끝 0
    return { y: -hgt * arc, scaleY: 1 + 0.12 * arc, scaleX: 1 - 0.06 * arc };
  },
};

const tada = {
  id: 'tada', name: '타다', category: '강조', kind: 'emphasis', defaultLength: 18,
  description: '살짝 커지며 흔들어 주목시킨다',
  params: [
    { key: 'amplitude', label: '각도', type: 'number', default: 8, min: 1, max: 45, step: 1 },
    { key: 'cycles', label: '횟수', type: 'number', default: 3, min: 1, max: 8, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 8, cyc = Math.max(1, Math.round(p.cycles ?? 3));
    const env = Math.sin(PI * t); // 양끝 0, 가운데 1
    return { rotation: amp * Math.sin(TAU * cyc * t), scale: 1 + 0.12 * env };
  },
};

const flash = {
  id: 'flash', name: '번쩍', category: '강조', kind: 'emphasis', defaultLength: 10,
  description: '번쩍 밝아진다',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.8, min: 0.1, max: 1, step: 0.01 },
    { key: 'cycles', label: '횟수', type: 'number', default: 2, min: 1, max: 8, step: 1 },
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.8, cyc = Math.max(1, Math.round(p.cycles ?? 2));
    return { brightness: amt * Math.abs(Math.sin(PI * cyc * t)) };
  },
};

const wiggle = {
  id: 'wiggle', name: '흔들흔들', category: '강조', kind: 'emphasis', defaultLength: 14,
  description: '좌우로 갸우뚱 흔든다',
  params: [
    { key: 'amplitude', label: '각도', type: 'number', default: 12, min: 1, max: 90, step: 1 },
    { key: 'cycles', label: '횟수', type: 'number', default: 3, min: 1, max: 10, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 12, cyc = Math.max(1, Math.round(p.cycles ?? 3));
    return { rotation: amp * Math.sin(TAU * cyc * t) };
  },
};

const spinOnce = {
  id: 'spin-once', name: '한 바퀴', category: '강조', kind: 'emphasis', defaultLength: 14,
  description: '한 바퀴 돌아 제자리로',
  params: [
    { key: 'turns', label: '회전 수', type: 'number', default: 1, min: 1, max: 4, step: 1 },
  ],
  evaluate(t, p) {
    const turns = Math.max(1, Math.round(p.turns ?? 1));
    return { rotation: 360 * turns * ease('easeInOutCubic', t) }; // t=1 → 360*turns(=제자리)
  },
};

const squash = {
  id: 'squash', name: '쿵 눌림', category: '강조', kind: 'emphasis', defaultLength: 12,
  description: '납작하게 눌렸다 돌아온다',
  params: [
    { key: 'amount', label: '세기', type: 'number', default: 0.3, min: 0.05, max: 0.8, step: 0.01 },
  ],
  evaluate(t, p) {
    const amt = p.amount ?? 0.3;
    const k = Math.sin(PI * t); // 양끝 0, 가운데 1
    return { scaleY: 1 - amt * k, scaleX: 1 + amt * 0.6 * k };
  },
};

export default [shake, nod, jump, tada, flash, wiggle, spinOnce, squash];
