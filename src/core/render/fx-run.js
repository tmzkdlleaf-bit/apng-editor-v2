// 효과 호출 공용부(R17) — 효과 레이어(layers/effect.js)와 레이어 효과 쌓기(fx-layer.js)가 함께 쓴다.
// 효과마다 seed 로 rng 를 따로 만들고(결정론), 임시 캔버스는 pool 에서 빌려 반드시 돌려준다.
// DOM 없음.
import { createRng } from './rng.js';

// def: 효과 정의({ render }). ctx: 그릴 대상 2D 컨텍스트. params: 계산된 파라미터값.
// env: { f, frameCount, w, h, seed, sources, scale, pad, pool }
export function runEffect(def, ctx, env, params) {
  if (!def?.render) return;
  const rng = createRng((env.seed ?? 1) >>> 0);
  const pool = env.pool;
  const _borrowed = [];
  const _borrow = (bw, bh) => { const c = pool.borrow(Math.max(1, bw | 0), Math.max(1, bh | 0)); _borrowed.push(c); return c; };
  const _release = (c) => { const i = _borrowed.indexOf(c); if (i >= 0) { _borrowed.splice(i, 1); pool.release(c); } };

  const _env = {
    f: env.f,
    frameCount: env.frameCount,
    fps: env.fps || 12, // R30: 초당 프레임(실제 시간 계산용)
    w: env.w,
    h: env.h,
    rng,
    sources: env.sources ?? [],
    scale: env.scale ?? 1,
    pad: env.pad ?? 0,
    borrow: _borrow,
    release: _release,
    blur: env.blur ?? null, // R34a: GPU 흐림 서비스(없으면 null → 효과가 CPU blur.js 사용)
  };

  // R27 "밝은 배경용": 꺼져 있으면(기본) 예전과 똑같이 ctx 에 바로 그린다(픽셀 동일).
  const lb = def.lightBg ? (params?.lightBg ?? 'off') : 'off';
  if (lb === 'off' || !ctx.canvas) {
    def.render(ctx, _env, params);
  } else {
    // 효과를 같은 크기·같은 좌표계의 임시 캔버스에 그린 뒤 대비를 보강해 합친다.
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const tmp = pool.borrow(cw, ch);
    const tc = tmp.getContext('2d');
    tc.setTransform(ctx.getTransform());
    def.render(tc, _env, params);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (lb === 'outline') {
      // 효과 모양 바깥에 어두운 반투명 1px 테두리 — 그 위에 원래 효과.
      // 실루엣: 옅은 부분(방울 속 등)도 모양에 넣으려고 알파를 크게 키운 뒤 어둡게 칠한다
      //   (lighter 로 자기 자신을 6번 겹쳐 64배 — 아주 옅은 칠도 꽉 찬 모양이 된다).
      const sil = pool.borrow(cw, ch);
      const sc = sil.getContext('2d');
      sc.drawImage(tmp, 0, 0);
      sc.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) sc.drawImage(sil, 0, 0);
      sc.globalCompositeOperation = 'source-in';
      sc.fillStyle = 'rgba(20,24,32,1)';
      sc.fillRect(0, 0, cw, ch);
      const o = Math.max(1, Math.round(env.scale ?? 1));
      // 테두리만: 4방향으로 넓힌 모양에서 원래 모양을 빼면 바깥 고리만 남는다(속은 원래 색 그대로).
      const ring = pool.borrow(cw, ch);
      const rc = ring.getContext('2d');
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) rc.drawImage(sil, dx, dy);
      rc.globalCompositeOperation = 'destination-out';
      rc.drawImage(sil, 0, 0);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(ring, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(tmp, 0, 0);
      pool.release(ring);
      pool.release(sil);
    } else {
      // 'dark' — 색을 눌러(곱하기) 어둡게 하고 불투명도를 올린다(일반 섞기). 효과 모양 밖은 그대로 투명.
      const orig = pool.borrow(cw, ch);
      orig.getContext('2d').drawImage(tmp, 0, 0);
      tc.globalCompositeOperation = 'multiply';
      tc.fillStyle = '#6b7280';
      tc.fillRect(0, 0, cw, ch);
      tc.globalCompositeOperation = 'destination-in';
      tc.drawImage(orig, 0, 0); // 원래 알파로 다시 자르기(곱하기가 투명 자리에 칠한 것 제거)
      tc.globalCompositeOperation = 'source-over';
      pool.release(orig);
      ctx.drawImage(tmp, 0, 0);
      ctx.drawImage(tmp, 0, 0); // 두 번 → 옅은 입자도 또렷하게
    }
    ctx.restore();
    pool.release(tmp);
  }

  for (const c of _borrowed) pool.release(c); // 효과가 안 돌려준 것 정리
}

// "밝은 배경용" 파라미터 정의 — lightBg:true 인 효과에 registry 가 붙인다(R27).
export const LIGHT_BG_PARAM = {
  key: 'lightBg', label: '밝은 배경용', type: 'select', default: 'off', advanced: true,
  options: [
    { value: 'off', label: '끔' },
    { value: 'outline', label: '테두리' },
    { value: 'dark', label: '진하게' },
  ],
};
