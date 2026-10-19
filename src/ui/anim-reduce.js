// 큰 GIF·APNG·WebP 를 줄여서 가져오기(R10-1). 프레임을 한 장씩 디코드·축소해 메모리를 아끼고,
// 무손실 APNG 로 다시 인코딩해 그 파일 하나를 에셋으로 쓴다(편집·내보내기 결과가 항상 같다).
import { encode } from '../export/encode.js';

export const ANIM_MEM_LIMIT = 150 * 1024 * 1024; // 150MB (바꿀 수 있는 기본값)

// 원본 메타로 예상 메모리(바이트) = 폭 × 높이 × 4 × 프레임 수.
export function estAnimMemory(meta) {
  return (meta?.width ?? 0) * (meta?.height ?? 0) * 4 * (meta?.frameCount ?? 1);
}

// 줄이기 계획: ① 긴 변을 줄이고(최소 50%) ② 그래도 넘으면 프레임을 건너뛴다.
export function planReduce(meta, limit = ANIM_MEM_LIMIT) {
  const w = Math.max(1, meta.width ?? 1), h = Math.max(1, meta.height ?? 1), n = Math.max(1, meta.frameCount ?? 1);
  const perFull = w * h * 4;
  let scale = Math.min(1, Math.sqrt(limit / (perFull * n)));
  scale = Math.max(0.5, scale);                       // 긴 변은 원래의 50% 까지만 줄인다
  const newW = Math.max(1, Math.round(w * scale));
  const newH = Math.max(1, Math.round(h * scale));
  const per = newW * newH * 4;
  let stride = 1;
  if (per * n > limit) stride = Math.ceil(n / Math.max(1, Math.floor(limit / per)));
  const newFrameCount = Math.ceil(n / stride);
  return { newW, newH, scale, stride, newFrameCount, estBytes: per * newFrameCount };
}

// blob(원본) → 줄인 APNG Blob + 메타. onProgress(done,total), signal 로 취소.
export async function reduceAnim(blob, meta, { limit = ANIM_MEM_LIMIT, onProgress = () => {}, signal = null } = {}) {
  if (typeof ImageDecoder === 'undefined') throw new Error('이 브라우저에서는 큰 파일 줄이기를 지원하지 않습니다.');
  const plan = planReduce(meta, limit);
  const buf = await blob.arrayBuffer();
  const dec = new ImageDecoder({ data: buf, type: blob.type || 'image/gif' });
  await dec.tracks.ready;
  const n = dec.tracks.selectedTrack?.frameCount ?? meta.frameCount ?? 1;
  const isGif = (blob.type || '').includes('gif');

  const off = new OffscreenCanvas(plan.newW, plan.newH);
  const octx = off.getContext('2d', { willReadFrequently: true });
  const frames = [];
  let pendingDelay = 0; // 맨 앞 건너뛴 프레임 지연(아직 kept 가 없을 때)

  try {
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
      const { image } = await dec.decode({ frameIndex: i, completeFramesOnly: true });
      let ms = Math.max(1, Math.round((image.duration ?? 100000) / 1000));
      if (isGif && ms <= 10) ms = 100; // R7-5 규칙과 일치(브라우저와 같은 지연 보정)
      if (i % plan.stride === 0) {
        octx.clearRect(0, 0, plan.newW, plan.newH);
        octx.drawImage(image, 0, 0, plan.newW, plan.newH);
        const id = octx.getImageData(0, 0, plan.newW, plan.newH);
        frames.push({ rgba: id.data, delayMs: ms + pendingDelay });
        pendingDelay = 0;
      } else if (frames.length) {
        frames[frames.length - 1].delayMs += ms; // 건너뛴 프레임 지연은 직전 kept 에 더해 전체 길이 유지
      } else {
        pendingDelay += ms;
      }
      image.close?.();
      onProgress(i + 1, n);
      if ((i & 7) === 0) await new Promise((r) => setTimeout(r, 0)); // 양보(진행 표시·취소 반응)
    }
  } finally {
    dec.close?.();
  }
  if (!frames.length) throw new Error('줄일 프레임이 없습니다.');

  // 무손실 APNG 로 재인코딩(워커). baked 프레임은 복사 없이 넘긴다.
  const baked = { width: plan.newW, height: plan.newH, frames };
  const { buf: apng } = await encode(baked, 'apng', { colors: 0, loops: 0 }, { moveFrames: true, signal });
  const outBlob = new Blob([apng], { type: 'image/png' });
  const delays = frames.map((f) => f.delayMs);
  const durationMs = delays.reduce((a, b) => a + b, 0);
  return { blob: outBlob, width: plan.newW, height: plan.newH, frameCount: frames.length, delays, durationMs };
}
