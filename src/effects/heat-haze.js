// 아지랑이(R28c) — 열기처럼 화면이 위로 흐르며 일렁인다. 가로 띠·세로 띠를 차례로 조금씩 밀어(빠름) 일렁임을 만든다.
//   범위: 아래쪽 몇 %부터(위로 갈수록 약해짐) / 전체 / 가리기로 지정(이 효과 레이어의 가리기 탭).
//   결정론·루프(정수 속도).
import { TAU, clamp, smoothstep } from './_fx-util.js';
import { LOOK_PARAM, lookOf, loopFbm } from './_fx-style.js';

export default {
  id: 'heat-haze',
  name: '아지랑이',
  category: '변형',
  description: '열기처럼 그림이 위로 흐르며 일렁인다(사막·불·마법진 위). 그림을 소스로 연결',
  thumbnail: { frame: 3, bg: '#1a140f' },
  bleed: 10,
  params: [
    { key: 'strength', label: '세기', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
    { key: 'scale', label: '일렁임 크기', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    { key: 'speed', label: '위로 흐르는 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'range', label: '범위', type: 'select', default: 'bottom',
      options: [{ value: 'bottom', label: '아래쪽부터' }, { value: 'full', label: '전체' }, { value: 'mask', label: '가리기로 지정' }] },
    { key: 'maskNote', label: '펜으로 지정·가리기로 지정: 이 효과 레이어의 「가리기」 칸에서 사각형·타원·펜으로 영역을 그리세요.', type: 'note' },
    { key: 'height', label: '아래쪽 높이', type: 'float', default: 0.5, min: 0.05, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(그림)' }],
  render(ctx, { f, frameCount, sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const st = clamp(p.strength ?? 0.7, 0, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st <= 0) { ctx.drawImage(src, pad, pad); ctx.restore(); return; }
    const prog = f / Math.max(1, frameCount);
    const sp = Math.max(1, Math.round(p.speed ?? 2));
    const sz = clamp(p.scale ?? 0.5, 0.1, 1);
    const amp = st * 5 * scale * (0.5 + sz);
    const kf = 1 / (14 * scale * (0.4 + sz));         // 공간 주파수
    const bottomOnly = (p.range ?? 'bottom') === 'bottom';
    const top = (1 - clamp(p.height ?? 0.5, 0.05, 1)) * H;
    const wAt = (y) => bottomOnly ? smoothstep(top, top + (H - top) * 0.5, y) : 1;
    const phase = TAU * sp * prog;
    // R30 실사(자료집 2-12): 사인 물결 대신 크기·속도가 다른 노이즈 두 겹이 위로 흐른다(한 겹이면 무늬가 미끄러져 보임).
    //   루프 동안 정수 칸 흐름 → 이음매 없음.
    const real = lookOf(p) === 'real';
    const step = Math.max(1, Math.round(2 * scale));
    // 1) 가로 띠: 줄마다 좌우로 밀기(위로 흐르는 물결 두 겹)
    const mid = borrow(W, H);
    const mc = mid.getContext('2d');
    mc.drawImage(src, 0, 0); // 바닥에 원본 — 띠를 밀어 생기는 가장자리 틈을 메운다
    for (let y = 0; y < H; y += step) {
      const w = wAt(y);
      const dx = real
        ? w * amp * 2.2 * ((loopFbm(y * kf * 0.25 + prog * sp * 16, 0.5, 16, 0, 11, 2) - 0.5) * 0.65 + (loopFbm(y * kf * 0.9 + prog * sp * 2 * 32, 3.5, 32, 0, 23, 2) - 0.5) * 0.35)
        : w * amp * (Math.sin(y * kf + phase) * 0.65 + Math.sin(y * kf * 2.3 + phase * 2 + 1.1) * 0.35);
      mc.drawImage(src, 0, y, W, step, dx, y, W, step);
    }
    // 2) 세로 띠: 열마다 위아래로 살짝(세로 일렁임은 약하게). 아래쪽 모드면 범위 위쪽은 그대로 두고 범위만.
    const y0 = bottomOnly ? Math.floor(top + (H - top) * 0.25) : 0;
    ctx.drawImage(mid, pad, pad); // 바닥에 한 번 — 열을 위아래로 밀어 생기는 틈을 메운다
    const k2 = bottomOnly ? 0.5 : 1;
    for (let x = 0; x < W; x += step) {
      const dy = real
        ? amp * 0.45 * k2 * 2.2 * (loopFbm(x * kf * 0.3, prog * sp * 8, 0, 8, 37, 2) - 0.5)
        : amp * 0.45 * k2 * Math.sin(x * kf * 0.8 + phase + Math.sin(x * kf * 0.31) * 2);
      ctx.drawImage(mid, x, y0, step, H - y0, pad + x, pad + y0 + dy, step, H - y0);
    }
    ctx.restore();
    release(mid);
  },
};
