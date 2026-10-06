// 내보내기 API — 문서를 굽고 인코딩해 Blob으로 돌려준다.
// exportAnimation(doc, opts) → { blob, bytes, width, height, frameCount, format, settings }
import { createRenderEngine } from '../core/render/frame.js';
import { bakeFrames } from '../core/export/bake.js';
import { checkLoopSeam } from '../core/anim/seam.js';
import { encode } from './encode.js';

const FORMAT_INFO = {
  // APNG 확장자는 .png (코코포리아·디스코드 업로드 호환). 바꿀 수 있는 기본값.
  apng: { ext: 'png',  mime: 'image/png'  },
  webp: { ext: 'webp', mime: 'image/webp' },
  gif:  { ext: 'gif',  mime: 'image/gif'  },
};

// 내보내기 전 경고(막지 않고 안내만). checkLoopSeam + 원샷(퇴장 클립) 경고.
export function getExportWarnings(doc, { loops = 0, motions = null } = {}) {
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

  // 1) 굽기
  const baked = await bakeFrames(eng, doc, {
    scale, range, playback, trim, createCanvas, signal,
    onProgress: (d, t) => onProgress({ phase: 'bake', done: d, total: t }),
  });
  if (baked.aborted) throw new DOMException('취소됨', 'AbortError');
  if (baked.warning && !allowLargeMemory) {
    const err = new Error('예상 메모리가 한도를 초과했습니다.');
    err.code = 'memory';
    err.warning = baked.warning;
    throw err;
  }

  // 2) 인코딩
  const encOptions = { loops: loopCount };
  if (format === 'apng') encOptions.colors   = colors ?? 0;
  if (format === 'webp') { encOptions.lossless = lossless ? 1 : 0; encOptions.quality = quality ?? 80; }

  const { buf, bytes } = await encode(baked, format, encOptions, {
    signal,
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
      warnings: getExportWarnings(doc, { loops: loopCount, motions }),
    },
  };
}

export { FORMAT_INFO };
