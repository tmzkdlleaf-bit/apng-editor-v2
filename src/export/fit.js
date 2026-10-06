// 목표 용량 맞추기 — 후보(크기×화질)를 순서대로 실제 인코딩해 처음으로 목표에 든 것을 고른다.
// 같은 크기에서는 굽기를 한 번만(baker 캐시) 하고 인코딩만 바꿔 다시 한다.
import { bakeFrames } from '../core/export/bake.js';
import { createRenderEngine } from '../core/render/frame.js';
import { encode } from './encode.js';
import { FORMAT_INFO } from './index.js';

const SCALE_MULS = [1, 0.75, 0.5, 0.25];
// 후보 순서(앞일수록 우선 = 화질 높음)
const APNG_COLORS = [0, 256, 128, 64, 32];                 // 0=무손실
const WEBP_OPTS   = [{ lossless: 1 }, { quality: 90 }, { quality: 75 }, { quality: 60 }, { quality: 45 }, { quality: 30 }];

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
// deps: { createCanvas, engine?, assets?, effects?, motions?, baker?, allowFrameReduction?, name? }
// ctx:  { onLog?, onProgress?, signal? }
// 반환: { blob, bytes, width, height, frameCount, format, reached, settings, bakeCount }
export async function fitToTarget(doc, preset, deps = {}, ctx = {}) {
  const { onLog = () => {}, onProgress = () => {}, signal = null } = ctx;
  const allowFrameReduction = !!deps.allowFrameReduction;

  if (typeof deps.createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');
  const engine = _engineFrom(deps, doc);
  const baker  = deps.baker ?? createBaker(engine, doc, deps.createCanvas);

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

  const encList   = encOptionsFor(format);
  const scaleMuls = target == null ? [1] : SCALE_MULS; // 목표 없으면 크기1 최고화질 1회

  const abortCheck = () => { if (signal?.aborted) throw new DOMException('취소됨', 'AbortError'); };
  let best = null; // { buf, bytes, baked, scale, scaleMul, encOpts, reduced }

  async function pass(reduced) {
    for (const mul of scaleMuls) {
      abortCheck();
      const scale = baseScale * mul;
      let baked = await baker.get(scale, { trim, playback, signal });
      if (baked.aborted) throw new DOMException('취소됨', 'AbortError');
      if (baked.warning) { onLog({ text: `건너뜀(x${mul}): 메모리 경고`, bytes: null, scaleMul: mul }); continue; }
      if (reduced) baked = halveFrames(baked);

      for (const encOpts of encList) {
        abortCheck();
        const { buf, bytes } = await encode(baked, format, { ...encOpts, loops }, { signal });
        const label = `x${mul} / ${optionLabel(format, encOpts)}${reduced ? ' / 프레임½' : ''}`;
        onLog({ text: `${label} → ${(bytes / 1024).toFixed(1)} KB`, bytes, scaleMul: mul, label, reduced });
        onProgress?.();

        if (!best || bytes < best.bytes) best = { buf, bytes, baked, scale, scaleMul: mul, encOpts, reduced };
        if (target == null) { best = { buf, bytes, baked, scale, scaleMul: mul, encOpts, reduced }; return true; }
        if (bytes <= target) { best = { buf, bytes, baked, scale, scaleMul: mul, encOpts, reduced }; return true; }
      }
    }
    return false;
  }

  let reached = await pass(false);
  if (!reached && target != null && allowFrameReduction) {
    onLog({ text: '프레임 줄이기(fps 절반)로 다시 시도', bytes: null });
    reached = await pass(true);
  }

  const blob = new Blob([best.buf], { type: info.mime });
  const durationMs = best.baked.frames.reduce((a, f) => a + f.delayMs, 0);
  return {
    blob,
    bytes: best.bytes,
    width: best.baked.width,
    height: best.baked.height,
    frameCount: best.baked.frames.length,
    durationMs,
    format,
    reached: target == null ? true : reached,
    bakeCount: baker.bakeCount(),
    settings: {
      presetId: preset.id,
      presetName: preset.name,
      scaleMul: best.scaleMul,
      scale: best.scale,
      ...best.encOpts,
      trim,
      loops,
      frameReduced: best.reduced,
      targetBytes: target,
      filename: `${deps.name ?? '프로젝트'}_${preset.id}.${info.ext}`,
      mime: info.mime,
    },
  };
}

// 여러 프리셋을 한 번에. 굽기는 크기가 같으면 공유(하나의 baker).
export async function exportMany(doc, presets, deps = {}, ctx = {}) {
  if (typeof deps.createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');
  const engine = _engineFrom(deps, doc);
  const baker  = createBaker(engine, doc, deps.createCanvas);
  const results = [];
  for (const preset of presets) {
    if (ctx.signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    const r = await fitToTarget(doc, preset, { ...deps, engine, baker }, {
      ...ctx,
      onLog: (e) => ctx.onLog?.({ ...e, presetId: preset.id }),
    });
    results.push(r);
  }
  return { results, bakeCount: baker.bakeCount() };
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
  // request(opts, onResult, onError) — 직전 요청을 취소하고 delay 뒤 실행
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

export { halveFrames };
