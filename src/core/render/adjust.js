// 픽셀 보정 — ctx.filter 미사용(사파리 호환)

// ─── LUT 빌더 (old/src/core/adjustments.js에서 직접 이식) ────────────────

const _LUT_CACHE_MAX = 64;
const _levelsLutCache = new Map();
const _curvesLutCache = new Map();

function _evict(cache) {
  if (cache.size >= _LUT_CACHE_MAX) cache.delete(cache.keys().next().value);
}

// [[inVal, outVal], ...] 배열로 256-entry Uint8Array LUT 생성
export function buildLut(points) {
  const lut = new Uint8Array(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < 256; i++) {
    if (i <= sorted[0][0]) { lut[i] = sorted[0][1]; continue; }
    if (i >= sorted[sorted.length - 1][0]) { lut[i] = sorted[sorted.length - 1][1]; continue; }
    let lo = sorted[0], hi = sorted[sorted.length - 1];
    for (let j = 0; j < sorted.length - 1; j++) {
      if (sorted[j][0] <= i && sorted[j + 1][0] >= i) { lo = sorted[j]; hi = sorted[j + 1]; break; }
    }
    const t = (i - lo[0]) / (hi[0] - lo[0]);
    lut[i] = Math.round(lo[1] + t * (hi[1] - lo[1]));
  }
  return lut;
}

// 레벨 보정 — inBlack/inWhite/gamma/outBlack/outWhite
export function applyLevels(data, levels) {
  const { inBlack=0, inWhite=255, gamma=1.0, outBlack=0, outWhite=255 } = levels;
  const key = `${inBlack}:${inWhite}:${gamma}:${outBlack}:${outWhite}`;
  let lut = _levelsLutCache.get(key);
  if (!lut) {
    lut = new Uint8Array(256);
    const inRange  = Math.max(1, inWhite - inBlack);
    const outRange = outWhite - outBlack;
    const gInv     = gamma > 0 ? 1 / gamma : 1;
    for (let i = 0; i < 256; i++) {
      let v = (i - inBlack) / inRange;
      v = Math.max(0, Math.min(1, v));
      v = Math.pow(v, gInv);
      lut[i] = Math.round(outBlack + v * outRange);
    }
    _evict(_levelsLutCache);
    _levelsLutCache.set(key, lut);
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i]     = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

// HSL 보정 — hueShift(-180~180), saturation(-100~200), lightness(-100~100)
export function applyHSL(data, hsl) {
  const { hueShift=0, saturation=0, lightness=0 } = hsl;
  const hShift = hueShift / 360;
  const sFact  = 1 + saturation / 100;
  const lShift = lightness  / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const [h, s, l] = _rgbToHsl(r, g, b);
    const nh = ((h + hShift) % 1 + 1) % 1;
    const ns = Math.max(0, Math.min(1, s * sFact));
    const nl = Math.max(0, Math.min(1, l + lShift));
    [r, g, b] = _hslToRgb(nh, ns, nl);
    data[i]     = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}

// 커브 보정 — curves.rgb/r/g/b 각각 [[in,out]] 배열
export function applyCurves(data, curves) {
  const key = JSON.stringify([curves.rgb ?? null, curves.r ?? null, curves.g ?? null, curves.b ?? null]);
  let cached = _curvesLutCache.get(key);
  if (!cached) {
    cached = {
      rgbLut: buildLut(curves.rgb ?? null),
      rLut:   buildLut(curves.r   ?? null),
      gLut:   buildLut(curves.g   ?? null),
      bLut:   buildLut(curves.b   ?? null),
    };
    _evict(_curvesLutCache);
    _curvesLutCache.set(key, cached);
  }
  const { rgbLut, rLut, gLut, bLut } = cached;
  const useRgb = !!(curves.rgb?.length);
  const useR   = !!(curves.r?.length);
  const useG   = !!(curves.g?.length);
  const useB   = !!(curves.b?.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (useRgb) { r = rgbLut[r]; g = rgbLut[g]; b = rgbLut[b]; }
    if (useR) r = rLut[r];
    if (useG) g = gLut[g];
    if (useB) b = bLut[b];
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

// 기본 보정: brightness(%), contrast(%), saturation(%), hue(°) — 픽셀 수준 계산
function _applyBasic(data, adjust) {
  const brightness = adjust.brightness ?? 100;
  const contrast   = adjust.contrast   ?? 100;
  const saturation = adjust.saturation ?? 100;
  const hue        = adjust.hue        ?? 0;

  const bFact = brightness / 100;
  const cFact = contrast   / 100;
  const sFact = saturation / 100;
  const hShift = hue / 360;

  const noB = bFact === 1, noC = cFact === 1, noS = sFact === 1, noH = hShift === 0;
  if (noB && noC && noS && noH) return;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;

    if (!noB) { r *= bFact; g *= bFact; b *= bFact; }
    if (!noC) {
      r = (r - 0.5) * cFact + 0.5;
      g = (g - 0.5) * cFact + 0.5;
      b = (b - 0.5) * cFact + 0.5;
    }
    if (!noS || !noH) {
      let [h, s, l] = _rgbToHsl(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
      if (!noS) s = Math.max(0, Math.min(1, s * sFact));
      if (!noH) h = ((h + hShift) % 1 + 1) % 1;
      [r, g, b] = _hslToRgb(h, s, l);
    }

    data[i]     = Math.round(Math.max(0, Math.min(255, r * 255)));
    data[i + 1] = Math.round(Math.max(0, Math.min(255, g * 255)));
    data[i + 2] = Math.round(Math.max(0, Math.min(255, b * 255)));
  }
}

// 3회 박스 블러(가우시안 근사) — ctx.filter 대신 픽셀 직접 계산
export function applyBlur(imageData, radius) {
  if (radius <= 0) return;
  const r = Math.round(radius);
  const tmp = new Uint8ClampedArray(imageData.data.length);
  for (let pass = 0; pass < 3; pass++) {
    _boxBlurH(imageData.data, tmp, imageData.width, imageData.height, r);
    _boxBlurV(tmp, imageData.data, imageData.width, imageData.height, r);
  }
}

// 가로 박스 블러 src→dst (sliding window, O(W*H))
function _boxBlurH(src, dst, w, h, r) {
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let sr = 0, sg = 0, sb = 0, sa = 0;
    // 초기 윈도우 [-r, r] clamped
    for (let dx = -r; dx <= r; dx++) {
      const xi = Math.max(0, Math.min(w - 1, dx));
      const idx = (base + xi) * 4;
      sr += src[idx]; sg += src[idx+1]; sb += src[idx+2]; sa += src[idx+3];
    }
    const diam = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      const idx = (base + x) * 4;
      dst[idx]   = sr / diam; dst[idx+1] = sg / diam;
      dst[idx+2] = sb / diam; dst[idx+3] = sa / diam;
      // 슬라이드: 왼쪽 클램핑 픽셀 빼기, 오른쪽 클램핑 픽셀 더하기
      const ox = Math.max(0, x - r), nx = Math.min(w - 1, x + r + 1);
      const oi = (base + ox) * 4, ni = (base + nx) * 4;
      sr += src[ni] - src[oi]; sg += src[ni+1] - src[oi+1];
      sb += src[ni+2] - src[oi+2]; sa += src[ni+3] - src[oi+3];
    }
  }
}

function _boxBlurV(src, dst, w, h, r) {
  for (let x = 0; x < w; x++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let dy = -r; dy <= r; dy++) {
      const yi = Math.max(0, Math.min(h - 1, dy));
      const idx = (yi * w + x) * 4;
      sr += src[idx]; sg += src[idx+1]; sb += src[idx+2]; sa += src[idx+3];
    }
    const diam = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      dst[idx]   = sr / diam; dst[idx+1] = sg / diam;
      dst[idx+2] = sb / diam; dst[idx+3] = sa / diam;
      const oy = Math.max(0, y - r), ny = Math.min(h - 1, y + r + 1);
      const oi = (oy * w + x) * 4, ni = (ny * w + x) * 4;
      sr += src[ni] - src[oi]; sg += src[ni+1] - src[oi+1];
      sb += src[ni+2] - src[oi+2]; sa += src[ni+3] - src[oi+3];
    }
  }
}

// levels → hsl → curves → basic → (blur 별도) 순서로 적용
export function applyAdjust(imageData, adjust) {
  if (!adjust) return;
  const d = imageData.data;
  if (adjust.levels) applyLevels(d, adjust.levels);
  if (adjust.hsl)    applyHSL(d,    adjust.hsl);
  if (adjust.curves) applyCurves(d, adjust.curves);
  _applyBasic(d, adjust);
}

export function hasAdjust(adjust) {
  if (!adjust) return false;
  const { brightness=100, contrast=100, saturation=100, hue=0, blur=0 } = adjust;
  return !!(brightness !== 100 || contrast !== 100 || saturation !== 100 || hue !== 0 || blur > 0
    || adjust.levels || adjust.hsl || adjust.curves);
}

// ─── 내부 HSL 변환 ────────────────────────────────────────────────────────

function _rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if      (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function _hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function _hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [_hue2rgb(p, q, h + 1 / 3), _hue2rgb(p, q, h), _hue2rgb(p, q, h - 1 / 3)];
}
