import { evalProp } from './prop.js';
import { evalClips } from './clip.js';

// 레이어 자신의 변환값만 반환. 부모→자식 행렬 합성은 P4 렌더에서 처리.
// opts: evalClips에 그대로 전달 (seamProbe 등).
//
// 모션 계약(S5-0): evaluate(t, params, env) 의 env = { w, h, frameCount, fps } = 레이어 기준 크기.
//   x·y 는 px(기존 호환). 레이어 크기 대비 비율로 움직이려는 모션은 env.w/env.h 를 곱해 직접 계산한다.
//   새 채널: scaleX·scaleY(곱), brightness(합, -1~1), slices(이어붙임), wrapX·wrapY(합).
function _baseSize(doc, layer) {
  if (layer.type === 'shape') return { w: layer.shape?.w ?? 100, h: layer.shape?.h ?? 100 };
  if (layer.type === 'effect' && layer.scope === 'box' && layer.box) return { w: layer.box.w ?? 100, h: layer.box.h ?? 100 };
  return { w: doc.meta.width, h: doc.meta.height };
}

export function evalTransform(doc, layerId, f, motions, opts = {}) {
  const layer = doc.layers[layerId];
  if (!layer) return { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };

  const { transform } = layer;
  const size = _baseSize(doc, layer);
  const ctx = {
    width:      doc.meta.width,
    height:     doc.meta.height,
    frameCount: doc.meta.frameCount,
    env:        { w: size.w, h: size.h, frameCount: doc.meta.frameCount, fps: doc.meta.fps },
    motions,
  };

  const base = {
    x:        evalProp(transform.x,        f),
    y:        evalProp(transform.y,        f),
    scale:    evalProp(transform.scale,    f),
    scaleX:   transform.scaleX ? evalProp(transform.scaleX, f) : 1,
    scaleY:   transform.scaleY ? evalProp(transform.scaleY, f) : 1,
    rotation: evalProp(transform.rotation, f),
    alpha:    evalProp(transform.alpha,    f),
  };

  const clips = evalClips(layer, f, ctx, opts);

  const out = {
    x:        base.x        + clips.x,
    y:        base.y        + clips.y,
    scale:    base.scale    * clips.scale,
    scaleX:   base.scaleX   * clips.scaleX,
    scaleY:   base.scaleY   * clips.scaleY,
    rotation: base.rotation + clips.rotation,
    alpha:    base.alpha    * clips.alpha,
  };
  // 렌더 전용 채널은 값이 있을 때만 실어 보낸다(없으면 기존 경로 그대로).
  if (clips.brightness) out.brightness = Math.max(-1, Math.min(1, clips.brightness));
  if (clips.slices && clips.slices.length) out.slices = clips.slices;
  if (clips.wrapX) out.wrapX = clips.wrapX;
  if (clips.wrapY) out.wrapY = clips.wrapY;
  return out;
}

export function evalCamera(doc, f) {
  const { camera } = doc;
  return {
    x:    evalProp(camera.x,    f),
    y:    evalProp(camera.y,    f),
    zoom: evalProp(camera.zoom, f),
  };
}
