import { evalProp } from './prop.js';

// 루프 클립의 "자연 연장" 위상: hold 규칙 없이 cycle 기준으로 f의 t를 계산.
// cycle=12, frameCount=24 → t_end=(24%12)/12=0 = t_start → 이음매 없음
// cycle=10, frameCount=24 → t_end=(24%10)/10=0.4 ≠ 0 → 이음매 있음
function _naturalT(clip, f) {
  const start = clip.start ?? 0;
  const cycle = (clip.cycle ?? clip.length) || 1;
  const raw = f - start;
  if (raw < 0) return 0;
  return (raw % cycle) / cycle;
}

// 모든 레이어(+ 카메라)에서 f=0 vs f=frameCount를 비교.
// 루프 클립은 hold 규칙 대신 자연 연장 위상으로 비교한다.
// 키프레임 prop은 evalProp으로 비교.
export function checkLoopSeam(doc, motions) {
  const { frameCount, width, height } = doc.meta;
  const issues = [];

  for (const layerId of Object.keys(doc.layers)) {
    const layer = doc.layers[layerId];

    // 루프 클립
    for (const clip of (layer.clips ?? [])) {
      if (!clip.loop) continue;
      const motion = motions instanceof Map ? motions.get(clip.motionId) : motions?.[clip.motionId];
      if (!motion) continue;

      const t0 = _naturalT(clip, 0);
      const tN = _naturalT(clip, frameCount);
      if (Math.abs(t0 - tN) < 1e-9) continue;

      const params = clip.params ?? {};
      const r0 = motion.evaluate(t0, params, { width, height });
      const rN = motion.evaluate(tN, params, { width, height });

      for (const prop of ['x', 'y', 'rotation', 'scale', 'alpha']) {
        const neutral = (prop === 'scale' || prop === 'alpha') ? 1 : 0;
        const v0 = r0[prop] ?? neutral;
        const vN = rN[prop] ?? neutral;
        if (Math.abs(v0 - vN) > 1e-6) {
          issues.push({ layerId, prop, at0: v0, atEnd: vN });
        }
      }
    }

    // 키프레임 Prop
    if (layer.transform) {
      for (const prop of ['x', 'y', 'scale', 'rotation', 'alpha']) {
        const p = layer.transform[prop];
        if (!p?.keys?.length) continue;
        const v0 = evalProp(p, 0);
        const vN = evalProp(p, frameCount);
        if (Math.abs(v0 - vN) > 1e-6) {
          issues.push({ layerId, prop, at0: v0, atEnd: vN });
        }
      }
    }
  }

  // 카메라
  if (doc.camera) {
    for (const prop of ['x', 'y', 'zoom']) {
      const p = doc.camera[prop];
      if (!p?.keys?.length) continue;
      const v0 = evalProp(p, 0);
      const vN = evalProp(p, frameCount);
      if (Math.abs(v0 - vN) > 1e-6) {
        issues.push({ layerId: '__camera__', prop, at0: v0, atEnd: vN });
      }
    }
  }

  return issues;
}
