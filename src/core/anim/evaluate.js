import { evalProp } from './prop.js';
import { evalClips } from './clip.js';

// 레이어 자신의 변환값만 반환. 부모→자식 행렬 합성은 P4 렌더에서 처리.
// opts: evalClips에 그대로 전달 (seamProbe 등).
export function evalTransform(doc, layerId, f, motions, opts = {}) {
  const layer = doc.layers[layerId];
  if (!layer) return { x: 0, y: 0, scale: 1, rotation: 0, alpha: 1 };

  const { transform } = layer;
  const ctx = {
    width:      doc.meta.width,
    height:     doc.meta.height,
    frameCount: doc.meta.frameCount,
    motions,
  };

  const base = {
    x:        evalProp(transform.x,        f),
    y:        evalProp(transform.y,        f),
    scale:    evalProp(transform.scale,    f),
    rotation: evalProp(transform.rotation, f),
    alpha:    evalProp(transform.alpha,    f),
  };

  const clips = evalClips(layer, f, ctx, opts);

  return {
    x:        base.x        + clips.x,
    y:        base.y        + clips.y,
    scale:    base.scale    * clips.scale,
    rotation: base.rotation + clips.rotation,
    alpha:    base.alpha    * clips.alpha,
  };
}

export function evalCamera(doc, f) {
  const { camera } = doc;
  return {
    x:    evalProp(camera.x,    f),
    y:    evalProp(camera.y,    f),
    zoom: evalProp(camera.zoom, f),
  };
}
