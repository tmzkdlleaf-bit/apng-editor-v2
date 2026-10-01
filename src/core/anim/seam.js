import { evalTransform, evalCamera } from './evaluate.js';

// evalTransform(f=0) vs evalTransform(f=frameCount, seamProbe) 를 비교.
// seamProbe=true: 루프 클립이 frameCount까지 걸쳐 있으면 hold 대신 자연 연장 위상 사용.
// 비-루프 클립(페이드인 등)은 일반 hold 규칙이 그대로 이음매를 드러낸다.
export function checkLoopSeam(doc, motions) {
  const { frameCount } = doc.meta;
  const issues = [];
  const seamOpts = { seamProbe: true };

  for (const layerId of Object.keys(doc.layers)) {
    const t0 = evalTransform(doc, layerId, 0, motions);
    const tN = evalTransform(doc, layerId, frameCount, motions, seamOpts);

    for (const prop of ['x', 'y', 'scale', 'rotation', 'alpha']) {
      if (Math.abs(t0[prop] - tN[prop]) > 1e-6) {
        issues.push({ layerId, prop, at0: t0[prop], atEnd: tN[prop] });
      }
    }
  }

  // 카메라: Prop만 있으므로 seamProbe 불필요
  const cam0 = evalCamera(doc, 0);
  const camN = evalCamera(doc, frameCount);
  for (const prop of ['x', 'y', 'zoom']) {
    if (Math.abs(cam0[prop] - camN[prop]) > 1e-6) {
      issues.push({ layerId: '__camera__', prop, at0: cam0[prop], atEnd: camN[prop] });
    }
  }

  return issues;
}
