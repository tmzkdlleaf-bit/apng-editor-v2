import { evalTransform, evalCamera } from './evaluate.js';
import { frameIndexAtTime } from '../io/anim-decode.js';

// 타자기/글자 애니 진행도(text.js 의 _progress 와 같은 식). 여기서는 0과 N 비교에만 쓴다.
function _progress(f, startF, endF, loop) {
  const dur = Math.max(1, (endF ?? 0) - (startF ?? 0));
  let t = (f - (startF ?? 0)) / dur;
  if (loop === 'loop') t = ((t % 1) + 1) % 1;
  else if (loop === 'pingpong') { const m = ((t % 2) + 2) % 2; t = m > 1 ? 2 - m : m; }
  else t = Math.max(0, Math.min(1, t)); // once
  return t;
}

// R10-2: 움직이는 이미지 이음새. loop 면 "문서 길이(ms)×speed"가 GIF 길이의 정수배인지,
//   once 면 문서 끝의 소스 프레임이 첫 프레임과 다른지. stretch·hold 는 항상 맞으므로 제외.
function _animSeam(doc, layer, frameCount) {
  const asset = doc.assets?.[layer.assetId];
  const gifMs = asset?.durationMs;
  if (!gifMs || gifMs <= 0) return null;
  const { mode = 'loop', speed = 1 } = layer.timing ?? {};
  if (mode === 'hold' || mode === 'stretch') return null;
  const fps = doc.meta.fps ?? 12;
  const docMs = (frameCount / Math.max(1, fps)) * 1000;
  const srcMs = docMs * (speed || 1);

  if (mode === 'once') {
    const delays = asset.delays;
    if (!Array.isArray(delays) || delays.length <= 1) return null;
    const total = delays.reduce((a, b) => a + b, 0);
    const idxEnd = frameIndexAtTime(delays, Math.max(0, Math.min(total - 0.001, srcMs)));
    if (idxEnd === 0) return null;              // 끝도 첫 프레임이면 안 튄다
    return { layerId: layer.id, kind: 'anim', mode, gifMs, docMs, speed };
  }
  // loop
  const nearest = Math.max(1, Math.round(srcMs / gifMs));
  const remMs = Math.abs(srcMs - nearest * gifMs);
  const tol = (1000 / Math.max(1, fps)) / 2; // 문서 1프레임 길이의 절반
  if (remMs <= tol) return null;
  return { layerId: layer.id, kind: 'anim', mode, gifMs, docMs, speed };
}

// R10-3: 타자기(reveal)·글자별 애니(charAnim) 이음새. frame 0 과 frame N 의 진행도가 다르면 경고.
function _textSeam(doc, layer, frameCount) {
  const out = [];
  const check = (cfg, which) => {
    if (!cfg) return;
    const s = cfg.startF ?? 0, e = cfg.endF ?? (frameCount - 1), lp = cfg.loop ?? 'once';
    const p0 = _progress(0, s, e, lp);
    const pN = _progress(frameCount, s, e, lp);
    if (Math.abs(p0 - pN) > 1e-3) out.push({ layerId: layer.id, kind: 'text', which });
  };
  check(layer.reveal, 'reveal');
  check(layer.charAnim, 'charAnim');
  return out;
}

// evalTransform(f=0) vs evalTransform(f=frameCount, seamProbe) 를 비교.
// seamProbe=true: 루프 클립이 frameCount까지 걸쳐 있으면 hold 대신 자연 연장 위상 사용.
export function checkLoopSeam(doc, motions) {
  const { frameCount } = doc.meta;
  const issues = [];
  const seamOpts = { seamProbe: true };

  for (const layerId of Object.keys(doc.layers)) {
    const layer = doc.layers[layerId];
    if (!layer) continue;

    const t0 = evalTransform(doc, layerId, 0, motions);
    const tN = evalTransform(doc, layerId, frameCount, motions, seamOpts);
    for (const prop of ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'alpha']) {
      if (Math.abs(t0[prop] - tN[prop]) > 1e-6) {
        issues.push({ layerId, prop, at0: t0[prop], atEnd: tN[prop] });
      }
    }

    if (layer.type === 'anim') { const a = _animSeam(doc, layer, frameCount); if (a) issues.push(a); }
    if (layer.type === 'text') { for (const t of _textSeam(doc, layer, frameCount)) issues.push(t); }
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

// R10-2 "문서 길이를 GIF에 맞추기" 계산. 문서 길이를 GIF 길이의 가장 가까운 정수배(최소 1배)로.
//   { frameCount, k, targetDocMs, residualMs, suggestedFps }  (고칠 게 없으면 null)
export function animSeamFix(doc, layerId) {
  const layer = doc.layers[layerId];
  if (!layer || layer.type !== 'anim') return null;
  const gifMs = doc.assets?.[layer.assetId]?.durationMs;
  if (!gifMs || gifMs <= 0) return null;
  const fps = doc.meta.fps ?? 12;
  const speed = layer.timing?.speed ?? 1;
  const curDocMs = (doc.meta.frameCount / Math.max(1, fps)) * 1000;
  const k = Math.max(1, Math.round((curDocMs * (speed || 1)) / gifMs));
  const targetDocMs = (k * gifMs) / (speed || 1);              // 이 문서 길이면 정확히 k바퀴
  const frameCount = Math.max(1, Math.round((targetDocMs * fps) / 1000));
  // 실제 남는 오차(소스 시간 기준): 프레임 단위라 딱 안 맞을 수 있다.
  const residualMs = Math.abs((frameCount / fps) * 1000 * (speed || 1) - k * gifMs);
  const framMs = 1000 / fps;
  let suggestedFps = null;
  if (residualMs >= framMs) {
    // newFrameCount 를 유지한 채 딱 맞는 정수 fps 를 찾는다(현재와 가까운 것 우선).
    let best = residualMs;
    for (let f = 1; f <= 120; f++) {
      if (f === fps) continue;
      const fc = Math.max(1, Math.round((k * gifMs * f) / (1000 * (speed || 1))));
      const resid = Math.abs((fc / f) * 1000 * (speed || 1) - k * gifMs);
      if (resid < best - 0.01 && resid <= (1000 / f) / 2 * (speed || 1)) {
        if (suggestedFps == null || Math.abs(f - fps) < Math.abs(suggestedFps - fps)) suggestedFps = f;
      }
    }
  }
  return { frameCount, k, targetDocMs, residualMs, suggestedFps };
}
