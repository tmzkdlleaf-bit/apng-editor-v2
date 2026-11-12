// 바람 모델(R27) — 풀·수풀·덩굴이 "고정점은 그대로, 끝으로 갈수록 휘는" 움직임의 공용 계산.
//   움직임(바람 흔들림·기울기 흔들림)과 효과(바람 휘기·풀숲)가 같이 쓴다. DOM 없음·결정론·루프.
//   루프: 모든 주기가 재생 진행(prog 0~1)의 정수배라 prog=0 과 prog=1 이 같은 값.
const TAU = Math.PI * 2;

function _hash(n, seed) {
  let x = (Math.imul((n | 0) + 1, 374761393) ^ Math.imul((seed | 0) + 7, 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// 돌풍 세기 0~1 — 정수 주파수 사인 몇 개를 섞어 가끔 높게 솟는 느린 곡선(루프 안전).
export function gustEnvelope(prog, seed = 1) {
  const a1 = _hash(1, seed) * TAU, a2 = _hash(2, seed) * TAU, a3 = _hash(3, seed) * TAU;
  const v = (Math.sin(TAU * prog + a1) + 0.6 * Math.sin(TAU * 2 * prog + a2) + 0.3 * Math.sin(TAU * 3 * prog + a3)) / 1.9;
  const u = Math.max(0, (v + 1) / 2);   // 0~1
  return u * u * u;                      // 가끔만 높게
}

// h: 고정점에서의 거리 비율(0 뿌리 ~ 1 끝), prog: 재생 진행 0~1.
// o = { cycles(정수), curve(휘는 정도, 1=곧게 기울기), lag(엇박자, 끝이 늦게 따라옴),
//       gust(돌풍 0~1), seed, phase(라디안, 포기마다 다르게 줄 때) }
// 반환: 끝(h=1) 기준 대략 -1~1(돌풍이면 조금 더)의 휨 — 세기를 곱해 쓴다.
export function windBend(h, prog, o = {}) {
  if (h <= 0) return 0;
  const cyc = Math.max(1, Math.round(o.cycles ?? 1));
  const curve = Math.max(0.1, o.curve ?? 1.6);
  const lag = Math.max(0, o.lag ?? 0.4);
  const gust = Math.max(0, Math.min(1, o.gust ?? 0));
  const ph = (o.phase ?? 0) - lag * h * Math.PI;
  const base = Math.sin(TAU * cyc * prog + ph);
  const flutter = 0.18 * Math.sin(TAU * 2 * cyc * prog + 1.7 * ph);
  const g = gust > 0 ? gustEnvelope(prog, o.seed ?? 1) : 0;
  const w = Math.pow(Math.min(1, h), curve);
  return w * ((base + flutter) * (1 + 1.2 * gust * g) + 0.6 * gust * g);
}

// 가로 위치(0~1)마다 다른 위상 — 수풀이 포기마다 따로 흔들리게. variation 0 이면 0.
export function windPhaseAt(u, variation, seed = 1) {
  if (!variation) return 0;
  // 부드러운 1D 값 노이즈(칸 5개, 이웃 보간) — 너무 촘촘하면 가는 줄기 하나가 좌우로 늘어나 보인다.
  const x = u * 5, i = Math.floor(x), t = x - i;
  const s = t * t * (3 - 2 * t);
  const a = _hash(i + 100, seed), b = _hash(i + 101, seed);
  return variation * Math.PI * (a + (b - a) * s);
}
