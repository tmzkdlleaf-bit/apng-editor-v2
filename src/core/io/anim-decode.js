// 움직이는 이미지 디코딩(F2-1) — GIF·APNG·애니메이션 WebP.
// 브라우저 ImageDecoder 로 프레임과 "제각각인 지연(ms)"을 그대로 뽑는다. DOM 없음(워커 가능).
// ImageDecoder 가 없거나(사파리 일부) 실패하면 null → 호출측이 정지 이미지로 대체.

// blob → { frames: ImageBitmap[], delays: number[](ms), width, height } 또는 null.
export async function decodeAnim(blob) {
  if (typeof ImageDecoder === 'undefined') return null;
  let dec;
  try {
    const buf = await blob.arrayBuffer();
    dec = new ImageDecoder({ data: buf, type: blob.type || 'image/gif' });
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    const n = track?.frameCount ?? 0;
    if (!n || n < 1) { dec.close?.(); return null; }
    const frames = [], delays = [];
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i, completeFramesOnly: true });
      const bmp = await createImageBitmap(image);
      frames.push(bmp);
      // VideoFrame.duration 은 마이크로초. 없으면 100ms 기본.
      const durUs = image.duration ?? 100000;
      delays.push(Math.max(1, Math.round(durUs / 1000)));
      image.close?.();
    }
    dec.close?.();
    return { frames, delays, width: frames[0].width, height: frames[0].height };
  } catch {
    try { dec?.close?.(); } catch {}
    return null;
  }
}

// 애니메이션 여부·프레임 수·지연만 가볍게 확인(레이어 생성 분기용). 실패 시 animated:false.
export async function probeAnim(blob) {
  if (typeof ImageDecoder === 'undefined') return { animated: false, frameCount: 1, delays: [], durationMs: 0 };
  let dec;
  try {
    const buf = await blob.arrayBuffer();
    dec = new ImageDecoder({ data: buf, type: blob.type || 'image/gif' });
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    const n = track?.frameCount ?? 1;
    const delays = [];
    let durationMs = 0;
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i, completeFramesOnly: true });
        const d = Math.max(1, Math.round((image.duration ?? 100000) / 1000));
        delays.push(d); durationMs += d;
        image.close?.();
      }
    }
    dec.close?.();
    return { animated: n > 1, frameCount: n, delays, durationMs };
  } catch {
    try { dec?.close?.(); } catch {}
    return { animated: false, frameCount: 1, delays: [], durationMs: 0 };
  }
}

// 누적 지연으로 시간 ts(ms)에 해당하는 소스 프레임 인덱스(0..n-1). "프레임 번호가 아니라 누적 시간" 기준.
export function frameIndexAtTime(delays, ts) {
  const n = delays.length;
  if (n <= 1) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += delays[i];
    if (ts < acc) return i;
  }
  return n - 1;
}
