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

  def.render(ctx, {
    f: env.f,
    frameCount: env.frameCount,
    w: env.w,
    h: env.h,
    rng,
    sources: env.sources ?? [],
    scale: env.scale ?? 1,
    pad: env.pad ?? 0,
    borrow: _borrow,
    release: _release,
  }, params);

  for (const c of _borrowed) pool.release(c); // 효과가 안 돌려준 것 정리
}
