// 스프라이트 시트 합성 — 구운 프레임(RGBA)을 한 장의 큰 RGBA 격자로 모은다(R13-2).
// DOM 없음(캔버스 안 씀, 타입드 배열 복사만). 내보내기 워커가 이 RGBA 를 1프레임 PNG 로 인코딩한다.

// 브라우저 캔버스 한계(바꿀 수 있는 기본값). 넘으면 미리 막는다.
export const SHEET_MAX_DIM = 16384;            // 가로·세로 최대 px
export const SHEET_MAX_AREA = 268_435_456;     // 넓이 최대(약 16384²)

// 기본 열 수 = ⌈√프레임 수⌉, 여백 0.
export function sheetLayout(frameCount, frameW, frameH, { cols = null, gap = 0 } = {}) {
  const n = Math.max(1, frameCount | 0);
  const c = Math.max(1, cols ?? Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / c);
  const width  = c * frameW + (c - 1) * gap;
  const height = rows * frameH + (rows - 1) * gap;
  return { cols: c, rows, width, height, gap };
}

// 한계 검사 — { ok, width, height, reason? }. ok=false 면 내보내기를 막고 안내한다.
export function checkSheetLimit(frameCount, frameW, frameH, opts = {}) {
  const { width, height, cols, rows } = sheetLayout(frameCount, frameW, frameH, opts);
  if (width > SHEET_MAX_DIM || height > SHEET_MAX_DIM) {
    return { ok: false, width, height, cols, rows, reason: 'dim' };
  }
  if (width * height > SHEET_MAX_AREA) {
    return { ok: false, width, height, cols, rows, reason: 'area' };
  }
  return { ok: true, width, height, cols, rows };
}

// frames: [{ rgba(Uint8ClampedArray fw*fh*4), delayMs }]. 모두 같은 크기(fw×fh)여야 한다.
// 반환: { rgba(Uint8ClampedArray), width, height, cols, rows, frames:[{index,x,y,w,h,delayMs}] }
export function composeSheet(frames, frameW, frameH, opts = {}) {
  const { cols, rows, width, height, gap } = sheetLayout(frames.length, frameW, frameH, opts);
  const out = new Uint8ClampedArray(width * height * 4);
  const placed = [];
  for (let i = 0; i < frames.length; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    const x = col * (frameW + gap);
    const y = row * (frameH + gap);
    const src = frames[i].rgba;
    for (let ry = 0; ry < frameH; ry++) {
      const si = ry * frameW * 4;
      const di = ((y + ry) * width + x) * 4;
      out.set(src.subarray(si, si + frameW * 4), di);
    }
    placed.push({ index: i, x, y, w: frameW, h: frameH, delayMs: frames[i].delayMs });
  }
  return { rgba: out, width, height, cols, rows, frames: placed };
}
