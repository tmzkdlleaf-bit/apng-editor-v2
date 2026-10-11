// 이펙트 레이어 — registry에서 render를 찾아 호출
// A3: 이펙트는 문서 단위(doc px) w/h를 받고, ctx에 renderScale이 적용된 상태에서 그림
import { createRng } from '../rng.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

export function renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const {
    effects, pool, rawDocWidth, rawDocHeight,
    width, height,
    viewOffsetX = 0, viewOffsetY = 0,
    f, frameCount, renderScale = 1,
  } = rctx;
  if (!effects) return;

  const effectId = layer.effectId;
  const effect   = effects.get?.(effectId);
  if (!effect?.render) return;

  const scope = layer.scope ?? 'full';
  const box   = layer.box;
  const wx    = worldTr.x ?? 0;
  const wy    = worldTr.y ?? 0;

  // ew/eh: 이펙트에 전달하는 크기 — 항상 문서 단위(doc px)
  // scope=full: rawDocWidth/Height; scope=box: box.w/h
  const docW = rawDocWidth  ?? Math.round(width  / renderScale);
  const docH = rawDocHeight ?? Math.round(height / renderScale);
  const ew = (scope === 'box' && box) ? Math.max(1, Math.round(box.w ?? 100)) : docW;
  const eh = (scope === 'box' && box) ? Math.max(1, Math.round(box.h ?? 100)) : docH;

  const seed = (layer.seed ?? 1) >>> 0;
  const rng  = createRng(seed);

  // contentCanvas 크기: 항상 렌더 픽셀(canvas pixels)
  // scope=full: view 크기 + 블리드 여유; scope=box: ew * renderScale
  // 블리드(bleed): 효과가 보이는 영역 밖으로 그리는 여유를 doc px 로 스스로 선언(기본 20 canvas px 상당).
  const bleedDoc = effect.bleed ?? (20 / renderScale);
  const PAD_PX = Math.max(0, Math.round(bleedDoc * renderScale));
  const contentW = (scope === 'full')
    ? width  + PAD_PX * 2
    : Math.max(1, Math.round(ew * renderScale));
  const contentH = (scope === 'full')
    ? height + PAD_PX * 2
    : Math.max(1, Math.round(eh * renderScale));

  const contentCanvas = pool.borrow(contentW, contentH);
  const contentCtx    = contentCanvas.getContext('2d');

  // renderScale을 ctx에 적용 → 이펙트는 문서 단위 좌표계에서 그린다
  contentCtx.scale(renderScale, renderScale);

  if (scope === 'full') {
    // scope=full: view 오프셋 + PAD 여유를 문서 단위로 변환
    contentCtx.translate(
      (-viewOffsetX + PAD_PX) / renderScale,
      (-viewOffsetY + PAD_PX) / renderScale,
    );
  }
  // scope=box: 중심 원점(0,0)에서 그림 — 블리팅 시 -ew/2 오프셋으로 중앙 정렬

  // 소스 슬롯(F4-5): 효과 정의의 sources[{key}] 마다 layer.sources 에서 소스 레이어를 찾아
  // 렌더해 전달한다. 자기 자신·조상은 UI 에서 막는다(여기선 방어적으로 건너뜀).
  const _sourceCanvases = [];
  const sourcesForRender = [];
  if (Array.isArray(effect.sources) && effect.sources.length && rctx.renderMask) {
    const map = {};
    for (const s of (layer.sources ?? [])) { if (s && s.key) map[s.key] = s.sourceId; }
    for (const def of effect.sources) {
      const sid = map[def.key];
      const src = sid ? rctx.doc.layers[sid] : null;
      let canvas = null;
      if (src && sid !== layer.id) {
        canvas = rctx.renderMask(src, f, width, height, { mode: 'alpha', ignoreVisible: true });
        if (canvas) _sourceCanvases.push(canvas);
      }
      sourcesForRender.push({ key: def.key, canvas });
    }
  }

  effect.render(contentCtx, {
    f,
    frameCount,
    w: ew,    // 문서 단위
    h: eh,    // 문서 단위
    rng,
    sources: sourcesForRender,
    scale: renderScale,
  }, layer.params ?? {});
  for (const c of _sourceCanvases) pool.release(c);

  const hasMask = !!(layer.mask && rctx.renderMask);

  if (hasMask) {
    // 마스크 경로: view 크기 작업 캔버스
    const tmp  = pool.borrow(width, height);
    const tmpC = tmp.getContext('2d');

    if (scope === 'full') {
      // PAD_PX 잘라내기 + worldTr(wx,wy) 오프셋
      tmpC.drawImage(contentCanvas, PAD_PX, PAD_PX, width, height, wx, wy, width, height);
    } else {
      // scope=box: view 오프셋 + worldTr 적용
      // A1: 정렬로 contentCanvas가 ew*renderScale보다 클 수 있음 → 실제 내용 영역만
      const cw = Math.round(ew * renderScale);
      const ch = Math.round(eh * renderScale);
      tmpC.save();
      tmpC.translate(-viewOffsetX, -viewOffsetY);
      applyTransform(tmpC, worldTr);
      tmpC.drawImage(contentCanvas, 0, 0, cw, ch, -ew / 2, -eh / 2, ew, eh);
      tmpC.restore();
    }

    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
      if (maskCanvas) {
        tmpC.setTransform(1, 0, 0, 1, 0, 0);
        tmpC.globalAlpha = 1;
        tmpC.globalCompositeOperation = 'destination-in';
        tmpC.drawImage(maskCanvas, 0, 0);
        tmpC.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }

    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(tmp, 0, 0);
    outputCtx.restore();
    pool.release(tmp);
  } else {
    // 마스크 없음: contentCanvas 직접 blit
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    if (scope === 'full') {
      outputCtx.drawImage(contentCanvas, PAD_PX, PAD_PX, width, height, wx, wy, width, height);
    } else {
      // A1: 정렬로 contentCanvas가 ew*renderScale보다 클 수 있음 → 실제 내용 영역만
      const cw = Math.round(ew * renderScale);
      const ch = Math.round(eh * renderScale);
      outputCtx.translate(-viewOffsetX, -viewOffsetY);
      applyTransform(outputCtx, worldTr);
      outputCtx.drawImage(contentCanvas, 0, 0, cw, ch, -ew / 2, -eh / 2, ew, eh);
    }
    outputCtx.restore();
  }

  pool.release(contentCanvas);
}
