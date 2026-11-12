// 레이어 효과 쌓기(R17) — 레이어 자체 좌표의 내용 캔버스에 효과를 fxOrder 순으로 적용한다.
// DOM 없음. 렌더 경로: 캔버스는 모두 pool 에서 빌리고 돌려준다.
//
// 애프터 이펙트식 순서: 내용 → 효과(fxOrder) → (바깥에서) 마스크 → 변형 → 블렌드.
// 효과 종류:
//   - sources(below)가 있는 효과(색수차·물결): 내용을 소스로 넘기고 결과로 내용을 바꾼다.
//   - 그 밖(빛무리·눈 등): 내용 위에 그린다.
// clip: 적용 전 내용의 알파로 결과를 자른다(destination-in). mix: 적용 전×(1−mix) + 적용 후×mix.
import { runEffect } from './fx-run.js';
import { evalProp } from '../anim/prop.js';
import { evalEffectParams } from '../anim/params.js';
import { applyTransform } from './matrix.js';
import { blendToComposite } from './blend.js';
import { applyMasksToWork, hasActiveMasks } from './shape-mask.js';

const _clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const MAX_SIDE = 4096;

// 켜져 있고 레지스트리에 있는 fx 목록(fxOrder 순).
export function activeFxIds(layer, effects) {
  if (!layer?.fxOrder?.length || !layer.fx || !effects) return [];
  return layer.fxOrder.filter((id) => {
    const fx = layer.fx[id];
    return fx && fx.enabled !== false && effects.get?.(fx.effectId)?.render;
  });
}

export function hasActiveFx(layer, effects) {
  return activeFxIds(layer, effects).length > 0;
}

// 켜진 효과들의 bleed(doc 단위) 최댓값. 레이어 바깥으로 번지는 여유.
function _maxBleed(layer, ids, effects) {
  let b = 0;
  for (const id of ids) {
    const def = effects.get(layer.fx[id].effectId);
    b = Math.max(b, def?.bleed ?? 20);
  }
  return b;
}

// 물리 캔버스(doc 영역이 [pad,pad,dW*k,dH*k])에 효과를 순서대로 적용한다. canvas 를 제자리에서 바꾼다.
// env: { f, frameCount, pool, effects, k, dW, dH, pad }
export function runFxStack(canvas, env, layer) {
  const { f, frameCount, pool, effects, k, dW, dH, pad } = env;
  const ids = activeFxIds(layer, effects);
  if (!ids.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cwk = Math.max(1, Math.round(dW * k));
  const chk = Math.max(1, Math.round(dH * k));

  for (const id of ids) {
    const fx = layer.fx[id];
    const def = effects.get(fx.effectId);
    if (!def?.render) continue;

    const mix = _clamp01(evalProp(fx.mix ?? { value: 1 }, f));
    if (mix <= 1e-4) continue; // mix 0 = 효과 없음

    const params = evalEffectParams({ params: fx.params, paramAnim: fx.paramAnim }, def, f);
    const isBelow = Array.isArray(def.sources) && def.sources.length > 0;
    const needPre = (fx.clip !== false) || mix < 0.9999 || isBelow;

    let pre = null;
    if (needPre) { pre = pool.borrow(W, H); pre.getContext('2d').drawImage(canvas, 0, 0); }

    if (isBelow) {
      // 소스 = 지금 내용(패드 없는 doc 영역). 내용을 지우고 효과 결과로 바꾼다.
      const src = pool.borrow(cwk, chk);
      src.getContext('2d').drawImage(canvas, pad, pad, cwk, chk, 0, 0, cwk, chk);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      const key = def.sources[0]?.key ?? 'below';
      runEffect(def, ctx, { f, frameCount, w: dW, h: dH, seed: fx.seed, scale: k, pad, sources: [{ key, canvas: src }], pool }, params);
      pool.release(src);
    } else {
      // 내용 위에 그린다 — ctx 를 doc 좌표(k 배율, pad 오프셋)로.
      ctx.setTransform(k, 0, 0, k, pad, pad);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      runEffect(def, ctx, { f, frameCount, w: dW, h: dH, seed: fx.seed, scale: k, pad, sources: [], pool }, params);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    if ((fx.clip !== false) && pre) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(pre, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (mix < 0.9999 && pre) {
      const blend = pool.borrow(W, H);
      const bc = blend.getContext('2d');
      bc.drawImage(pre, 0, 0);          // 적용 전
      bc.globalAlpha = mix;
      bc.drawImage(canvas, 0, 0);       // 적용 후를 mix 만큼 위에
      bc.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(blend, 0, 0);
      pool.release(blend);
    }
    if (pre) pool.release(pre);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// 해상도 배율 k: 확대해도 효과가 흐려지지 않게. renderScale×레이어 축척, 긴 변 4096 상한.
function _resolveK(worldTr, dW, dH) {
  const ratio = Math.max(Math.abs(worldTr.scaleX ?? 1), Math.abs(worldTr.scaleY ?? 1));
  let k = Math.max(1, (worldTr.scale ?? 1) * ratio);
  k = Math.min(k, MAX_SIDE / Math.max(1, dW), MAX_SIDE / Math.max(1, dH));
  return Math.max(0.01, k);
}

// leaf 내용에 효과를 쌓아 출력한다. buildContent(k) 는 해상도 k(내용 px/doc 단위)로 내용 캔버스를 만들어
//   { canvas, srcCw, srcCh, release? } 를 돌려준다(벡터 도형·글자는 k 로 구워 확대해도 선명).
// geom = { dW, dH, ox, oy }  (doc 단위 크기와 앵커). worldTr 변형·블렌드·투명도까지 여기서 적용한다
//   (마스크는 R17a 범위 밖 — 해당 조합은 드묾).
export function drawLeafWithFx(outputCtx, buildContent, geom, layer, worldTr, totalAlpha, rctx) {
  const { dW, dH, ox, oy } = geom;
  const { pool, effects, f, frameCount } = rctx;
  const ids = activeFxIds(layer, effects);
  const k = _resolveK(worldTr, dW, dH);
  const bleed = _maxBleed(layer, ids, effects);
  const pad = Math.max(0, Math.round(bleed * k));
  const cwk = Math.max(1, Math.round(dW * k));
  const chk = Math.max(1, Math.round(dH * k));
  const W = cwk + pad * 2, H = chk + pad * 2;

  const content = buildContent(k);
  const work = pool.borrow(W, H);
  const wc = work.getContext('2d');
  wc.drawImage(content.canvas, 0, 0, content.srcCw, content.srcCh, pad, pad, cwk, chk);
  content.release?.();

  runFxStack(work, { f, frameCount, pool, effects, k, dW, dH, pad }, layer);

  // R21: 가리기(masks) — 효과 다음, 변형 전. 레이어 자체 좌표에서 내용 알파를 자른다.
  if (hasActiveMasks(layer)) {
    applyMasksToWork(work, { f, k, pad, dW, dH, W, H, pool, cache: rctx.cache }, layer);
  }

  outputCtx.save();
  applyTransform(outputCtx, worldTr, { top: -oy, bottom: dH - oy });
  outputCtx.scale(1 / k, 1 / k);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(work, -(pad + ox * k), -(pad + oy * k));
  outputCtx.restore();
  pool.release(work);
}
