// 바람 휘기(R27) — 소스(아래 레이어/그룹)를 "고정점은 그대로, 멀수록 더" 휘게 한다. 가로 위치마다 엇박자를
//   줘서 수풀이 포기마다 따로 흔들리는 느낌. 물결(wave)은 화면 전체를 같은 모양으로 흔들고, 이건 뿌리를 붙든다.
// 쓰는 법: 풀·수풀 그림 레이어를 숨기고 이 효과의 소스로 연결한다.
// 그리는 법: 소스의 그림이 있는 범위(작게 줄여 찾음)만 픽셀 단위로 옮긴다(조각 경계 틈·계단 없음).
// 결정론·루프(바람 모델의 주기가 모두 정수배).
import { clamp } from './_fx-util.js';
import { windBend, windPhaseAt } from '../core/anim/wind.js';

const PROBE = 64; // 그림 범위 찾기용 축소 크기

export default {
  id: 'wind-bend',
  name: '바람 휘기',
  category: '날씨',
  description: '소스 그림의 뿌리는 붙들고 끝만 휘게 흔든다. 수풀이 포기마다 따로 흔들림(그림 레이어를 소스로 연결)',
  thumbnail: { frame: 6, bg: '#0d1410' },
  bleed: 0,
  params: [
    { key: 'anchor', label: '고정할 쪽', type: 'select', default: 'bottom',
      options: [
        { value: 'bottom', label: '아래(풀·꽃)' }, { value: 'top', label: '위(매달린 것)' },
        { value: 'left', label: '왼쪽(깃발)' }, { value: 'right', label: '오른쪽' },
      ] },
    { key: 'strength', label: '세기', type: 'float', default: 20, min: 0, max: 200, step: 1 },
    { key: 'curve', label: '휘는 정도', type: 'float', default: 1.6, min: 0.5, max: 4, step: 0.1 },
    { key: 'lag', label: '엇박자', type: 'float', default: 0.4, min: 0, max: 2, step: 0.05 },
    { key: 'variation', label: '포기마다 다르게', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'gust', label: '돌풍', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'cycles', label: '횟수', type: 'int', default: 1, min: 1, max: 8 },
    { key: 'cells', label: '칸 수', type: 'int', default: 24, min: 4, max: 64, advanced: true },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(휘게 할 그림)' }],
  render(ctx, { f, frameCount, rng, sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const seed = 1 + Math.floor(rng() * 9999);
    const amp = Math.max(0, p.strength ?? 20) * scale;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, pad, pad);
    if (amp <= 0) { ctx.restore(); return; }

    // 1) 그림이 있는 범위 — 64×64 로 줄여 알파가 있는 행·열을 찾는다.
    const probe = borrow(PROBE, PROBE);
    const pc = probe.getContext('2d');
    pc.drawImage(src, 0, 0, W, H, 0, 0, PROBE, PROBE);
    const pd = pc.getImageData(0, 0, PROBE, PROBE).data;
    release(probe);
    let r0 = PROBE, r1 = -1, c0 = PROBE, c1 = -1;
    for (let y = 0; y < PROBE; y++) for (let x = 0; x < PROBE; x++) {
      if (pd[(y * PROBE + x) * 4 + 3] > 0) { if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x; }
    }
    if (r1 < 0) { ctx.restore(); return; }
    const top = Math.max(0, Math.floor((r0 - 1) * H / PROBE));
    const bottom = Math.min(H, Math.ceil((r1 + 2) * H / PROBE));
    const left = Math.max(0, Math.floor((c0 - 1) * W / PROBE));
    const right = Math.min(W, Math.ceil((c1 + 2) * W / PROBE));

    const anchor = p.anchor ?? 'bottom';
    const vertical = anchor === 'left' || anchor === 'right'; // 휨이 세로 방향(깃발)
    const prog = f / Math.max(1, frameCount);
    const o = { cycles: p.cycles ?? 1, curve: p.curve ?? 1.6, lag: p.lag ?? 0.4, gust: p.gust ?? 0, seed };
    const variation = clamp(p.variation ?? 0.6, 0, 1);
    const C = Math.max(4, Math.min(64, Math.round(p.cells ?? 24)));

    // 2) 바꿀 영역: 길이 방향으로는 그림 범위, 휨 방향으로는 그림 범위 ± 최대 밀림(휜 끝이 범위 밖으로 나가도 그려지게).
    const reach = Math.ceil(amp * (1 + 0.35 * clamp(p.variation ?? 0.6, 0, 1)) * (1.2 + 1.8 * clamp(p.gust ?? 0, 0, 1)) + 2);
    const rx = vertical ? left : Math.max(0, left - reach), ry = vertical ? Math.max(0, top - reach) : top;
    const rw = vertical ? right - left : Math.min(W, right + reach) - rx;
    const rh = vertical ? Math.min(H, bottom + reach) - ry : bottom - top;
    if (rw <= 0 || rh <= 0) { ctx.restore(); return; }
    const sc = src.getContext('2d');
    const inData = sc.getImageData(rx, ry, rw, rh).data;
    const outCanvas = borrow(rw, rh);
    const oc = outCanvas.getContext('2d');
    const outImg = oc.createImageData(rw, rh);
    const out = outImg.data;

    const span = vertical ? Math.max(1, right - left) : Math.max(1, bottom - top);
    const across = vertical ? rh : rw;          // 엇박자 방향 길이(영역)
    const across0 = vertical ? ry : rx;         // 영역 시작(전체 좌표)
    const acrossFull = vertical ? H : W;
    const phases = new Float64Array(C + 1);
    const mults = new Float64Array(C + 1);
    for (let c = 0; c <= C; c++) {
      phases[c] = windPhaseAt((across0 + (c / C) * across) / acrossFull, variation, seed);
      mults[c] = 1 + variation * 0.35 * (Math.sin(phases[c] * 1.3 + 0.7));
    }
    const ctrl = new Float64Array(C + 1);

    // 한 줄(길이 방향 위치 하나)마다 칸 제어점 C+1 개의 밀림을 계산하고, 그 사이는 선형 보간(경계 끊김 없음).
    //   가로(아래/위 고정): 줄 = 행, 엇박자 방향 = x.  세로(왼/오른쪽 고정): 줄 = 열, 엇박자 방향 = y.
    //   행 단위로 처리하려고 세로일 때는 "줄 index·위치 index"만 바꿔 같은 계산을 쓴다.
    const lines = vertical ? rw : rh;
    const stepIn = vertical ? rw * 4 : 4;        // 엇박자 방향으로 한 칸 갈 때 바이트 간격
    const dxs = new Float64Array(across);
    for (let li = 0; li < lines; li++) {
      let h;
      if (vertical) { const x = rx + li; h = anchor === 'left' ? (x - left) / span : (right - x) / span; }
      else { const y = ry + li; h = anchor === 'bottom' ? (bottom - y) / span : (y - top) / span; }
      h = clamp(h, 0, 1);
      for (let c = 0; c <= C; c++) { o.phase = phases[c]; ctrl[c] = amp * mults[c] * windBend(h, prog, o); }
      const scaleU = C / Math.max(1, across - 1);
      for (let k = 0; k < across; k++) {
        const u = k * scaleU;
        const ci = u >= C ? C - 1 : (u | 0), fr = u - ci;
        dxs[k] = ctrl[ci] + (ctrl[ci + 1] - ctrl[ci]) * fr;
      }
      const base = vertical ? li * 4 : li * rw * 4;  // 이 줄의 첫 픽셀 바이트 위치
      for (let k = 0; k < across; k++) {
        const sPos = k - dxs[k];
        const s0 = Math.floor(sPos);
        if (s0 < -1 || s0 >= across) continue;
        const oi = base + k * stepIn;
        const i0 = base + s0 * stepIn, i1 = i0 + stepIn;
        const a0 = s0 >= 0 ? inData[i0 + 3] : 0;
        const a1 = s0 + 1 < across ? inData[i1 + 3] : 0;
        if ((a0 | a1) === 0) continue;
        const w1 = ((sPos - s0) * 256) | 0, w0 = 256 - w1;
        if (a0 === 255 && a1 === 255) { // 불투명 안쪽 — 알파 곱 없이 정수 보간
          out[oi] = (inData[i0] * w0 + inData[i1] * w1) >> 8;
          out[oi + 1] = (inData[i0 + 1] * w0 + inData[i1 + 1] * w1) >> 8;
          out[oi + 2] = (inData[i0 + 2] * w0 + inData[i1 + 2] * w1) >> 8;
          out[oi + 3] = 255;
          continue;
        }
        if (w1 === 0) { // 정수 자리 → 그대로 복사(밀림 0 이면 픽셀 동일)
          out[oi] = inData[i0]; out[oi + 1] = inData[i0 + 1]; out[oi + 2] = inData[i0 + 2]; out[oi + 3] = a0;
          continue;
        }
        // 가장자리 — 알파 곱한 값으로 보간(어두운 테 방지)
        const p0 = a0 * w0, p1 = a1 * w1, a = p0 + p1;   // a = 알파×256
        if (a <= 0) continue;
        const r0 = s0 >= 0 ? inData[i0] : 0, g0 = s0 >= 0 ? inData[i0 + 1] : 0, b0 = s0 >= 0 ? inData[i0 + 2] : 0;
        const r1 = a1 ? inData[i1] : 0, g1 = a1 ? inData[i1 + 1] : 0, b1 = a1 ? inData[i1 + 2] : 0;
        out[oi] = (r0 * p0 + r1 * p1) / a;
        out[oi + 1] = (g0 * p0 + g1 * p1) / a;
        out[oi + 2] = (b0 * p0 + b1 * p1) / a;
        out[oi + 3] = a >> 8;
      }
    }
    oc.putImageData(outImg, 0, 0);
    ctx.clearRect(pad + rx, pad + ry, rw, rh);
    ctx.drawImage(outCanvas, pad + rx, pad + ry);
    release(outCanvas);
    ctx.restore();
  },
};
