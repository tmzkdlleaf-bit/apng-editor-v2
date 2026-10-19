// 목표 용량 맞추기 — 크기 후보마다 "목표에 드는 가장 좋은 화질"을 찾아(이분 탐색) 점수로 고른다.
// 점수 = 크기배율² × 화질계수. 가장 높은 점수의 후보를 고른다(R9-1).
// 방식(mode): 'quality'(화질 우선, 기본) / 'keepSize'(크기 1 고정) / 'keepColor'(화질 최고 고정, 크기만).
import { bakeFrames } from '../core/export/bake.js';
import { createRenderEngine } from '../core/render/frame.js';
import { createEncoder } from './encode.js';
import { FORMAT_INFO } from './index.js';

const SCALE_MULS = [1, 0.75, 0.5, 0.25];
// 후보 순서(앞일수록 우선 = 화질 높음)
const APNG_COLORS = [0, 256, 128, 64, 32];                 // 0=무손실
const WEBP_OPTS   = [{ lossless: 1 }, { quality: 90 }, { quality: 75 }, { quality: 60 }, { quality: 45 }, { quality: 30 }];

// 화질계수(바꿀 수 있는 기본값) — 점수 = 크기배율² × 화질계수.
const QUALITY_COEF = {
  apng: { 0: 1.0, 256: 0.92, 128: 0.8, 64: 0.62, 32: 0.45 },
  webp: { lossless: 1.0, 90: 0.95, 75: 0.85, 60: 0.72, 45: 0.6, 30: 0.45 },
  gif:  {}, // 화질 후보 없음 → 크기만으로 비교(계수 1)
};

function qualityCoef(format, o) {
  const t = QUALITY_COEF[format];
  if (!t) return 1;
  if (format === 'apng') return t[o.colors ?? 0] ?? 0.45;
  if (format === 'webp') return o.lossless ? t.lossless : (t[o.quality] ?? 0.45);
  return 1;
}

function encOptionsFor(format) {
  if (format === 'apng') return APNG_COLORS.map((c) => ({ colors: c }));
  if (format === 'webp') return WEBP_OPTS;
  return [{}]; // GIF: 항상 255색+투명, 화질 후보 없음
}

function optionLabel(format, o) {
  if (format === 'apng') return o.colors === 0 ? '무손실' : `${o.colors}색`;
  if (format === 'webp') return o.lossless ? '무손실' : `품질 ${o.quality}`;
  return 'GIF 255색';
}

// 짝수 인덱스만 남기고 지연을 합쳐 프레임 절반(전체 길이 보존). 다시 굽지 않는다.
function halveFrames(baked) {
  const frames = [];
  for (let i = 0; i < baked.frames.length; i += 2) {
    const a = baked.frames[i], b = baked.frames[i + 1];
    frames.push({ rgba: a.rgba, delayMs: a.delayMs + (b ? b.delayMs : 0) });
  }
  return { ...baked, frames };
}

// 크기별 굽기 캐시. 같은 (scale, trim, playback)이면 한 번만 굽는다.
export function createBaker(engine, doc, createCanvas) {
  const cache = new Map();
  let count = 0;
  async function get(scale, { trim = false, playback = 'loop', signal = null } = {}) {
    const key = `${scale.toFixed(6)}|${trim}|${playback}`;
    if (cache.has(key)) return cache.get(key);
    count++;
    const baked = await bakeFrames(engine, doc, { scale, trim, playback, createCanvas, signal });
    cache.set(key, baked);
    return baked;
  }
  return { get, bakeCount: () => count };
}

function _engineFrom(deps, doc) {
  return deps.engine ?? createRenderEngine({
    createCanvas: deps.createCanvas, assets: deps.assets, effects: deps.effects, motions: deps.motions,
  });
}

// 한 프리셋을 목표 용량에 맞춘다.
// deps: { createCanvas, engine?, assets?, effects?, motions?, baker?, allowFrameReduction?, name?, mode? }
// ctx:  { onLog?, onProgress?, signal? }
// 반환: { blob, bytes, width, height, frameCount, format, reached, settings, bakeCount, encodeCount }
export async function fitToTarget(doc, preset, deps = {}, ctx = {}) {
  const { onLog = () => {}, onProgress = () => {}, signal = null } = ctx;
  const allowFrameReduction = !!deps.allowFrameReduction;
  const mode = deps.mode === 'keepSize' || deps.mode === 'keepColor' ? deps.mode : 'quality';

  if (typeof deps.createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');
  const engine = _engineFrom(deps, doc);
  const baker  = deps.baker ?? createBaker(engine, doc, deps.createCanvas);
  const enc    = deps.encoder ?? createEncoder();
  const ownEnc = !deps.encoder;

  const format   = preset.format;
  const info     = FORMAT_INFO[format];
  if (!info) throw new Error('알 수 없는 형식: ' + format);
  const target   = preset.targetBytes ?? null;
  const trim     = !!preset.trim;
  const playback = doc.meta.playback ?? 'loop';
  const loops    = preset.loops ?? (playback === 'once' ? 1 : 0);

  // 크기 제한 프리셋: 그 안에 맞춘 크기를 "크기 1"로 본다.
  let baseScale = 1;
  if (preset.maxWidth || preset.maxHeight) {
    const sw = preset.maxWidth  ? preset.maxWidth  / doc.meta.width  : Infinity;
    const sh = preset.maxHeight ? preset.maxHeight / doc.meta.height : Infinity;
    baseScale = Math.min(1, sw, sh);
  }

  const fullEnc = encOptionsFor(format);
  // 방식별 후보 범위. keepColor: 화질 최고(첫 후보) 고정. keepSize/quality: 전체 화질 후보.
  const encList = (mode === 'keepColor') ? [fullEnc[0]] : fullEnc;
  // 크기 후보. 목표 없으면 1배 1회. keepSize: 1배만. 그 외: 1→0.25.
  const scaleMuls = (target == null || mode === 'keepSize') ? [1] : SCALE_MULS;

  const abortCheck = () => { if (signal?.aborted) throw new DOMException('취소됨', 'AbortError'); };
  let best = null;     // 목표에 든 것 중 점수 최고: { buf, bytes, baked, scale, scaleMul, encOpts, reduced, score }
  let smallest = null; // 전체에서 가장 작은 결과(아무 것도 목표에 못 들 때 폴백)
  let lastWarning = null;
  let encodeCount = 0;

  const MAX_COEF = 1.0; // 최고 화질(무손실)의 계수 — 더 작은 크기가 낼 수 있는 점수의 상한 계산용.

  async function pass(reduced) {
    for (let si = 0; si < scaleMuls.length; si++) {
      const mul = scaleMuls[si];
      abortCheck();
      const scale = baseScale * mul;
      let baked = await baker.get(scale, { trim, playback, signal });
      if (baked.aborted) throw new DOMException('취소됨', 'AbortError');
      if (baked.warning) { lastWarning = baked.warning; onLog({ text: `건너뜀(x${mul}): 메모리 경고`, bytes: null, scaleMul: mul }); continue; }
      if (reduced) baked = halveFrames(baked);

      const cache = new Map(); // index → { buf, bytes }
      const encAt = async (i) => {
        if (cache.has(i)) return cache.get(i);
        abortCheck();
        const { buf, bytes } = await enc.encode(baked, format, { ...encList[i], loops }, { signal });
        encodeCount++;
        const label = `x${mul} / ${optionLabel(format, encList[i])}${reduced ? ' / 프레임½' : ''}`;
        onLog({ text: `${label} → ${(bytes / 1024).toFixed(1)} KB`, bytes, scaleMul: mul, label, reduced });
        onProgress?.();
        const r = { buf, bytes };
        cache.set(i, r);
        if (!smallest || bytes < smallest.bytes) smallest = { buf, bytes, baked, scale, scaleMul: mul, encOpts: encList[i], reduced };
        return r;
      };

      let chosenIdx = -1;
      if (target == null) {
        await encAt(0); chosenIdx = 0;           // 목표 없음 → 최고 화질 1회
      } else {
        // 이분 탐색: 용량이 화질 순서로 대체로 줄므로, 목표에 드는 가장 좋은 화질(가장 작은 index)을 찾는다.
        let lo = 0, hi = encList.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const { bytes } = await encAt(mid);
          if (bytes <= target) { chosenIdx = mid; hi = mid - 1; } // 더 좋은 화질(왼쪽) 시도
          else lo = mid + 1;
        }
        // 단조성 점검(인코딩한 점들): 낮은 화질이 오히려 더 크면 순서대로 다시 확인.
        const idxs = [...cache.keys()].sort((a, b) => a - b);
        let mono = true;
        for (let k = 1; k < idxs.length; k++) {
          if (cache.get(idxs[k]).bytes > cache.get(idxs[k - 1]).bytes * 1.02) { mono = false; break; }
        }
        if (!mono) {
          onLog({ text: `x${mul}: 용량이 화질 순서와 어긋나 순서대로 확인`, bytes: null, scaleMul: mul });
          chosenIdx = -1;
          for (let i = 0; i < encList.length; i++) { const { bytes } = await encAt(i); if (bytes <= target) { chosenIdx = i; break; } }
        }
      }

      if (chosenIdx >= 0) {
        const c = cache.get(chosenIdx);
        const score = mul * mul * qualityCoef(format, encList[chosenIdx]);
        onLog({ text: `x${mul} 선택: ${optionLabel(format, encList[chosenIdx])} · ${(c.bytes / 1024).toFixed(1)}KB · 점수 ${score.toFixed(3)}`, bytes: c.bytes, scaleMul: mul, score, chosen: true });
        if (!best || score > best.score) best = { buf: c.buf, bytes: c.bytes, baked, scale, scaleMul: mul, encOpts: encList[chosenIdx], reduced, score };
        if (target == null) return true;
      }

      // 가지치기: 더 작은 크기가 낼 수 있는 최고 점수(다음 배율²×무손실)보다 지금 best 가 높으면 멈춘다.
      //   → 흔한 경우(큰 크기에서 괜찮은 화질이 맞으면) 작은 크기는 굽지 않는다(굽기·인코딩 절약).
      const nextMul = scaleMuls[si + 1];
      if (best && nextMul != null && best.score >= nextMul * nextMul * MAX_COEF) break;
    }
    return best != null;
  }

  try {
    let reached = await pass(false);
    if (!reached && target != null && allowFrameReduction) {
      onLog({ text: '프레임 줄이기(fps 절반)로 다시 시도', bytes: null });
      reached = await pass(true);
    }

    const pick = best ?? smallest;
    if (!pick) {
      const err = new Error('캔버스·프레임 수가 커서 메모리가 부족합니다. 크기를 줄여 보세요.');
      err.code = 'memory';
      if (lastWarning) err.warning = lastWarning;
      throw err;
    }

    const blob = new Blob([pick.buf], { type: info.mime });
    const durationMs = pick.baked.frames.reduce((a, f) => a + f.delayMs, 0);
    return {
      blob,
      bytes: pick.bytes,
      width: pick.baked.width,
      height: pick.baked.height,
      frameCount: pick.baked.frames.length,
      durationMs,
      format,
      reached: target == null ? true : (best != null),
      bakeCount: baker.bakeCount(),
      encodeCount,
      settings: {
        presetId: preset.id,
        presetName: preset.name,
        mode,
        scaleMul: pick.scaleMul,
        scale: pick.scale,
        score: pick.score ?? null,
        ...pick.encOpts,
        trim,
        loops,
        frameReduced: pick.reduced,
        targetBytes: target,
        filename: `${deps.name ?? '프로젝트'}_${preset.id}.${info.ext}`,
        mime: info.mime,
      },
    };
  } finally {
    if (ownEnc) enc.dispose();
  }
}

// 여러 프리셋을 한 번에. 굽기는 크기가 같으면 공유(하나의 baker).
// 메모리로 실패한 프리셋은 전체를 멈추지 않고 그 줄만 오류로 기록한다(R9-2 A).
export async function exportMany(doc, presets, deps = {}, ctx = {}) {
  if (typeof deps.createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');
  const engine = _engineFrom(deps, doc);
  const baker  = createBaker(engine, doc, deps.createCanvas);
  const encoder = createEncoder();  // 모든 프리셋이 워커 하나를 공유
  const results = [];
  try {
    for (const preset of presets) {
      if (ctx.signal?.aborted) throw new DOMException('취소됨', 'AbortError');
      try {
        const r = await fitToTarget(doc, preset, { ...deps, engine, baker, encoder }, {
          ...ctx,
          onLog: (e) => ctx.onLog?.({ ...e, presetId: preset.id }),
        });
        results.push(r);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;          // 취소는 전체 중단
        if (err?.code === 'memory') { results.push({ error: 'memory', warning: err.warning ?? null, preset }); continue; }
        throw err;                                          // 그 밖의 오류는 올린다
      }
    }
    return { results, bakeCount: baker.bakeCount() };
  } finally {
    encoder.dispose();
  }
}

// 용량 예상 — 추정식이 아니라 실제 인코딩 한 번. exportAnimation 과 같은 경로.
export async function estimateSize(doc, opts = {}) {
  const { exportAnimation } = await import('./index.js');
  const res = await exportAnimation(doc, opts);
  return { bytes: res.bytes, blob: res.blob, width: res.width, height: res.height, frameCount: res.frameCount };
}

// 설정을 바꾸면 0.5초 뒤 다시 인코딩(이전 작업 취소)하는 디바운스 예상기.
export function createEstimator(doc, baseOpts = {}, { delay = 500 } = {}) {
  let timer = null;
  let ctrl = null;
  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (ctrl) { ctrl.abort(); ctrl = null; }
  }
  function request(opts, onResult = () => {}, onError = () => {}) {
    cancel();
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const res = await estimateSize(doc, { ...baseOpts, ...opts, signal: ctrl.signal });
        onResult(res);
      } catch (err) {
        if (err?.name !== 'AbortError') onError(err);
      }
    }, delay);
  }
  return { request, cancel };
}

export { halveFrames, QUALITY_COEF, qualityCoef };
