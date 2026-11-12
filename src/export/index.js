// 내보내기 API — 문서를 굽고 인코딩해 Blob으로 돌려준다.
// exportAnimation(doc, opts) → { blob, bytes, width, height, frameCount, format, settings }
import { createRenderEngine } from '../core/render/frame.js';
import { bakeFrames } from '../core/export/bake.js';
import { checkLoopSeam } from '../core/anim/seam.js';
import { composeSheet, checkSheetLimit, SHEET_MAX_DIM } from '../core/export/sheet.js';
import { applyVariant, safeVariantName } from '../core/doc/variants.js';
import { encode, encodePngSeq } from './encode.js';
import { buildZip } from './zip.js';

const FORMAT_INFO = {
  // APNG 확장자는 .png (코코포리아·디스코드 업로드 호환). 바꿀 수 있는 기본값.
  apng: { ext: 'png',  mime: 'image/png'  },
  webp: { ext: 'webp', mime: 'image/webp' },
  gif:  { ext: 'gif',  mime: 'image/gif'  },
  // PNG 묶음·스프라이트 시트는 zip 하나로 묶어 저장한다(R13-2).
  'png-seq': { ext: 'zip', mime: 'application/zip' },
  sprite:    { ext: 'zip', mime: 'application/zip' },
};

const ZIP_MIME = 'application/zip';
function _loopCountOf(doc, { playback, loops }) {
  const pb = playback ?? doc.meta.playback ?? 'loop';
  return loops ?? (pb === 'once' ? 1 : 0);
}
function _pad4(n) { return String(n).padStart(4, '0'); }

// 내보내기 전 경고(막지 않고 안내만). checkLoopSeam + 원샷(퇴장 클립) 경고.
export function getExportWarnings(doc, { loops = 0, motions = null, effects = null } = {}) {
  const warnings = [];
  const seam = checkLoopSeam(doc, motions);
  if (seam.length) warnings.push({ type: 'seam', issues: seam });

  // loops=1(단발)이면 원샷 클립 문제 없음. 무한/다회 반복이면 매 반복마다 다시 재생된다.
  if (loops !== 1) {
    const hasOneShot = Object.values(doc.layers).some((l) => l && l.exit);
    if (hasOneShot) {
      warnings.push({
        type: 'oneshot',
        message: '등장·퇴장 효과가 있어 반복할 때마다 다시 재생됩니다. 해당 레이어를 확인하세요.',
      });
    }
    // R28a: 한 번(once) 재생되는 효과(전환·깨짐·터짐) — 반복 재생 때 끊겨 보일 수 있다.
    if (effects) {
      const names = new Set();
      for (const l of Object.values(doc.layers)) {
        if (!l || l.visible === false) continue;
        const items = [];  // [effectId, params]
        if (l.type === 'effect' && l.effectId) items.push([l.effectId, l.params ?? {}]);
        for (const fid of (l.fxOrder ?? [])) { const fx = l.fx?.[fid]; if (fx && fx.enabled !== false) items.push([fx.effectId, fx.params ?? {}]); }
        for (const [id, params] of items) {
          const def = effects.get?.(id);
          // once 는 참거짓 또는 파라미터를 받아 판단하는 함수(예: 흘러내림 '한 번' 방식일 때만).
          const once = typeof def?.once === 'function' ? def.once(params) : def?.once;
          if (once) names.add(def.name ?? id);
        }
      }
      if (names.size) {
        warnings.push({
          type: 'oneshot',
          message: `한 번 재생되는 효과(${[...names].join(', ')})가 있어 반복 재생 때 끊겨 보일 수 있습니다.`,
        });
      }
    }
  }
  return warnings;
}

export async function exportAnimation(doc, opts = {}) {
  const {
    format = 'apng',
    scale = 1,
    trim = false,
    playback = doc.meta.playback ?? 'loop',
    loops,                // 명시 없으면 playback으로 결정
    range = null,
    name = '프로젝트',
    engine = null,        // 주입된 렌더 엔진(없으면 생성)
    createCanvas,
    assets, effects, motions,
    onProgress = () => {},
    signal = null,
    allowLargeMemory = false,
    colors, lossless, quality,
  } = opts;

  const info = FORMAT_INFO[format];
  if (!info) throw new Error('알 수 없는 형식: ' + format);
  if (typeof createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');

  const eng = engine ?? createRenderEngine({ createCanvas, assets, effects, motions });
  const loopCount = loops ?? (playback === 'once' ? 1 : 0);

  // 1) 굽기 — allowLargeMemory 면 한도를 풀어 실제로 굽는다(경고만 내고 프레임 없는 결과 금지).
  const baked = await bakeFrames(eng, doc, {
    scale, range, playback, trim, createCanvas, signal,
    ...(allowLargeMemory ? { maxMemoryMB: Infinity } : {}),
    onProgress: (d, t) => onProgress({ phase: 'bake', done: d, total: t }),
  });
  if (baked.aborted) throw new DOMException('취소됨', 'AbortError');
  if (baked.warning) {
    const err = new Error('예상 메모리가 한도를 초과했습니다.');
    err.code = 'memory';
    err.warning = baked.warning;
    throw err;
  }

  // 2) 인코딩
  const encOptions = { loops: loopCount };
  if (format === 'apng') encOptions.colors   = colors ?? 0;
  if (format === 'webp') { encOptions.lossless = lossless ? 1 : 0; encOptions.quality = quality ?? 80; }

  // 단일 내보내기는 굽기 결과를 복사하지 않고 그대로 워커로 넘긴다(메모리 절약, R9-2).
  // 이 경로는 baked 를 다시 쓰지 않으므로 프레임 버퍼를 떼어 보내도 안전하다.
  const { buf, bytes } = await encode(baked, format, encOptions, {
    signal,
    moveFrames: true,
    onProgress: (d, t) => onProgress({ phase: 'encode', done: d, total: t }),
  });

  const blob = new Blob([buf], { type: info.mime });
  const filename = `${name}_${format}.${info.ext}`;
  const durationMs = baked.frames.reduce((a, f) => a + f.delayMs, 0);

  return {
    blob,
    bytes,
    width: baked.width,
    height: baked.height,
    frameCount: baked.frames.length,
    durationMs,
    format,
    settings: {
      scale, trim, playback, loops: loopCount, range,
      filename, mime: info.mime,
      colors: encOptions.colors, lossless: encOptions.lossless, quality: encOptions.quality,
      warnings: getExportWarnings(doc, { loops: loopCount, motions, effects }),
    },
  };
}

// ── PNG 묶음(프레임마다 PNG + timing.json → zip) ─────────────────────────
// 같은 프레임도 합치지 않는다(noMerge) → 파일 수 = 문서 프레임 수(핑퐁이면 펼친 수).
export async function exportPngSequence(doc, opts = {}) {
  const {
    scale = 1, trim = false, range = null,
    playback = doc.meta.playback ?? 'loop', loops,
    name = '프로젝트', engine = null, createCanvas,
    assets, effects, motions, colors = 0,
    onProgress = () => {}, signal = null, allowLargeMemory = false,
  } = opts;
  if (typeof createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');

  const eng = engine ?? createRenderEngine({ createCanvas, assets, effects, motions });
  const loopCount = _loopCountOf(doc, { playback, loops });

  const baked = await bakeFrames(eng, doc, {
    scale, range, playback, trim, createCanvas, signal, noMerge: true,
    ...(allowLargeMemory ? { maxMemoryMB: Infinity } : {}),
    onProgress: (d, t) => onProgress({ phase: 'bake', done: d, total: t }),
  });
  if (baked.aborted) throw new DOMException('취소됨', 'AbortError');
  if (baked.warning) { const e = new Error('예상 메모리가 한도를 초과했습니다.'); e.code = 'memory'; e.warning = baked.warning; throw e; }

  const { pngs, order, delays } = await encodePngSeq(baked, { colors }, {
    signal, onProgress: (d, t) => onProgress({ phase: 'encode', done: d, total: t }),
  });

  const entries = [];
  const timing = { fps: doc.meta.fps ?? 12, playback, loops: loopCount, frames: [] };
  order.forEach((uniqIdx, k) => {
    const file = `${name}_${_pad4(k + 1)}.png`;
    entries.push({ name: file, data: new Uint8Array(pngs[uniqIdx]) });
    timing.frames.push({ file, delayMs: delays[k] });
  });
  entries.push({ name: 'timing.json', data: new TextEncoder().encode(JSON.stringify(timing, null, 2)) });

  const zip = buildZip(entries);
  const blob = new Blob([zip], { type: ZIP_MIME });
  const durationMs = delays.reduce((a, b) => a + b, 0);
  const filename = `${name}_png-seq.zip`;
  return {
    blob, bytes: zip.length, width: baked.width, height: baked.height,
    frameCount: order.length, durationMs, format: 'png-seq',
    settings: { scale, trim, playback, loops: loopCount, filename, mime: ZIP_MIME, fileCount: order.length },
  };
}

// ── 스프라이트 시트(한 장 PNG + sheet.json → zip) ─────────────────────────
export async function exportSpriteSheet(doc, opts = {}) {
  const {
    scale = 1, trim = false, range = null,
    playback = doc.meta.playback ?? 'loop', loops,
    name = '프로젝트', engine = null, createCanvas,
    assets, effects, motions, colors = 0, cols = null, gap = 0,
    onProgress = () => {}, signal = null, allowLargeMemory = false,
  } = opts;
  if (typeof createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');

  const eng = engine ?? createRenderEngine({ createCanvas, assets, effects, motions });
  const loopCount = _loopCountOf(doc, { playback, loops });

  const baked = await bakeFrames(eng, doc, {
    scale, range, playback, trim, createCanvas, signal, noMerge: true,
    ...(allowLargeMemory ? { maxMemoryMB: Infinity } : {}),
    onProgress: (d, t) => onProgress({ phase: 'bake', done: d, total: t }),
  });
  if (baked.aborted) throw new DOMException('취소됨', 'AbortError');
  if (baked.warning) { const e = new Error('예상 메모리가 한도를 초과했습니다.'); e.code = 'memory'; e.warning = baked.warning; throw e; }

  const fw = baked.width, fh = baked.height, n = baked.frames.length;
  // 캔버스 한계 초과면 막고, 몇 % 로 줄이면 되는지(R9-2 버튼 재사용) 함께 돌려준다.
  const lim = checkSheetLimit(n, fw, fh, { cols, gap });
  if (!lim.ok) {
    const ratio = Math.min(SHEET_MAX_DIM / lim.width, SHEET_MAX_DIM / lim.height);
    const err = new Error('스프라이트 시트가 캔버스 한계를 넘습니다. 크기를 줄이거나 프레임을 나누세요.');
    err.code = 'sheet-too-large';
    // suggestShrinkMul(curMul) = curMul·√(lim/est) 가 필요한 비율이 되도록 est·lim 을 맞춘다.
    err.warning = { estimatedBytes: 1, limitBytes: ratio * ratio, sheetWidth: lim.width, sheetHeight: lim.height };
    throw err;
  }

  const sheet = composeSheet(baked.frames, fw, fh, { cols, gap });
  onProgress({ phase: 'encode', done: 0, total: 1 });
  const fakeBaked = { width: sheet.width, height: sheet.height, frames: [{ rgba: sheet.rgba, delayMs: 0 }] };
  const { buf } = await encode(fakeBaked, 'png', { colors }, { signal, moveFrames: true });
  onProgress({ phase: 'encode', done: 1, total: 1 });

  const sheetJson = {
    frameWidth: fw, frameHeight: fh, cols: sheet.cols, rows: sheet.rows,
    fps: doc.meta.fps ?? 12, playback, loops: loopCount,
    frames: sheet.frames,
  };
  const entries = [
    { name: `${name}_sheet.png`, data: new Uint8Array(buf) },
    { name: `${name}_sheet.json`, data: new TextEncoder().encode(JSON.stringify(sheetJson, null, 2)) },
  ];
  const zip = buildZip(entries);
  const blob = new Blob([zip], { type: ZIP_MIME });
  const durationMs = sheet.frames.reduce((a, f) => a + f.delayMs, 0);
  const filename = `${name}_sprite.zip`;
  return {
    blob, bytes: zip.length, width: sheet.width, height: sheet.height,
    frameCount: n, durationMs, format: 'sprite',
    settings: { scale, trim, playback, loops: loopCount, filename, mime: ZIP_MIME, cols: sheet.cols, rows: sheet.rows, frameWidth: fw, frameHeight: fh },
  };
}

// ── 세트 한 번에 만들기(바리에이션 → zip) ────────────────────────────────
// 변형마다 "값을 덮어쓴 임시 문서 복사본"으로 내보내고(원본·되돌리기 기록 안 건드림),
// 결과 파일들을 zip 하나로 묶는다. 현재 용도(형식·크기·목표 용량)를 그대로 쓴다.
//   preset.targetBytes 가 있으면 변형마다 fitToTarget 으로 맞춘다(따로따로).
//   없으면 exportAnimation(현재 형식)으로 1회 인코딩.
// opts: { rows, preset, format?, scale?, trim?, name?, createCanvas, assets, effects, motions,
//         allowFrameReduction?, mode?, colors?, lossless?, quality?, loops?,
//         onProgress?({index,total,name,phase}), signal? }
export async function exportSet(doc, opts = {}) {
  const {
    rows = doc.variants?.rows ?? [],
    preset = null,
    format = preset?.format ?? doc.meta?.exportFormat ?? 'apng',
    name = '프로젝트',
    createCanvas, assets, effects, motions,
    onProgress = () => {}, signal = null,
  } = opts;
  if (typeof createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('내보낼 변형이 없습니다.');

  const info = FORMAT_INFO[format];
  if (!info) throw new Error('알 수 없는 형식: ' + format);
  const target = preset?.targetBytes ?? null;

  const entries = [];
  const results = [];
  const total = rows.length;
  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    const row = rows[i];
    const vname = safeVariantName(row?.name, i);
    onProgress({ index: i, total, name: vname, phase: 'start' });
    const tempDoc = applyVariant(doc, row);

    const baseOpts = {
      format, scale: opts.scale ?? 1, trim: opts.trim ?? !!preset?.trim,
      name: `${name}_${vname}`, createCanvas, assets, effects, motions,
      signal,
      onProgress: (p) => onProgress({ index: i, total, name: vname, phase: p.phase, done: p.done, pdone: p.total }),
    };
    if (format === 'apng') baseOpts.colors = opts.colors ?? preset?.colors ?? 0;
    if (format === 'webp') { baseOpts.lossless = opts.lossless ?? 0; baseOpts.quality = opts.quality ?? 80; }
    if (opts.loops != null) baseOpts.loops = opts.loops;

    let res;
    if (format === 'png-seq')      res = await exportPngSequence(tempDoc, baseOpts);
    else if (format === 'sprite')  res = await exportSpriteSheet(tempDoc, baseOpts);
    else if (target != null) {
      // 목표 용량 맞추기 — 변형마다 따로 맞춘다.
      const { fitToTarget } = await import('./fit.js');
      const fitPreset = { ...preset, format, trim: baseOpts.trim };
      res = await fitToTarget(tempDoc, fitPreset, {
        createCanvas, assets, effects, motions, name: baseOpts.name,
        allowFrameReduction: opts.allowFrameReduction, mode: opts.mode,
      }, { signal, onProgress: () => onProgress({ index: i, total, name: vname, phase: 'fit' }) });
    } else {
      res = await exportAnimation(tempDoc, baseOpts);
    }

    const ext = res.format === 'png-seq' || res.format === 'sprite' ? 'zip' : (FORMAT_INFO[res.format]?.ext ?? info.ext);
    const filename = `${name}_${vname}.${ext}`;
    entries.push({ name: filename, data: new Uint8Array(await res.blob.arrayBuffer()) });
    results.push({ name: row?.name ?? vname, filename, bytes: res.bytes, width: res.width, height: res.height, format: res.format });
    onProgress({ index: i, total, name: vname, phase: 'done', bytes: res.bytes });
  }

  const zip = buildZip(entries);
  const blob = new Blob([zip], { type: ZIP_MIME });
  const filename = `${name}_세트.zip`;
  return { blob, bytes: zip.length, count: results.length, results, format: 'set', settings: { filename, mime: ZIP_MIME } };
}

export { FORMAT_INFO };
