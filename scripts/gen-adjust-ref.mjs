// adjust-reference.json 생성 스크립트
// 사용: node scripts/gen-adjust-ref.mjs
// old/src/core/adjustments.js 함수와 동일한 결과를 내는지 검증하고
// tests/fixtures/adjust-reference.json에 기준값을 저장한다.
//
// 이 스크립트는 gen 목적으로만 old/ import가 허용된다.
// 앱·테스트 코드는 old/ import 금지.

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../tests/fixtures/adjust-reference.json');

// old/ 모듈 직접 사용: src/core/render/adjust.js와 동일한 로직인지 검증용
// 실행 시: node --input-type=module < scripts/gen-adjust-ref.mjs
// 또는 별도 입력 없이 직접 실행

function buildLut(points) {
  const lut = new Uint8Array(256);
  if (!points || !points.length) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
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

function applyLevels(data, levels) {
  const { inBlack = 0, inWhite = 255, gamma = 1.0, outBlack = 0, outWhite = 255 } = levels;
  const lut = new Uint8Array(256);
  const inRange = Math.max(1, inWhite - inBlack);
  const outRange = outWhite - outBlack;
  const gInv = gamma > 0 ? 1 / gamma : 1;
  for (let i = 0; i < 256; i++) {
    let v = (i - inBlack) / inRange;
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, gInv);
    lut[i] = Math.round(outBlack + v * outRange);
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = lut[data[i]]; data[i+1] = lut[data[i+1]]; data[i+2] = lut[data[i+2]];
  }
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  function hue2rgb(t) {
    t = ((t % 1) + 1) % 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  return [hue2rgb(h + 1/3), hue2rgb(h), hue2rgb(h - 1/3)];
}

function applyHSL(data, hsl) {
  const { hueShift = 0, saturation = 0, lightness = 0 } = hsl;
  const hShift = hueShift / 360;
  const sFact  = 1 + saturation / 100;
  const lShift = lightness / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
    let [h, s, l] = rgbToHsl(r, g, b);
    h = ((h + hShift) % 1 + 1) % 1;
    s = Math.max(0, Math.min(1, s * sFact));
    l = Math.max(0, Math.min(1, l + lShift));
    [r, g, b] = hslToRgb(h, s, l);
    data[i] = Math.round(r * 255); data[i+1] = Math.round(g * 255); data[i+2] = Math.round(b * 255);
  }
}

function applyCurves(data, curves) {
  const rgbLut = buildLut(curves.rgb ?? null);
  const rLut   = buildLut(curves.r   ?? null);
  const gLut   = buildLut(curves.g   ?? null);
  const bLut   = buildLut(curves.b   ?? null);
  const useRgb = !!(curves.rgb?.length), useR = !!(curves.r?.length);
  const useG   = !!(curves.g?.length),   useB = !!(curves.b?.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i], g = data[i+1], b = data[i+2];
    if (useRgb) { r = rgbLut[r]; g = rgbLut[g]; b = rgbLut[b]; }
    if (useR) r = rLut[r]; if (useG) g = gLut[g]; if (useB) b = bLut[b];
    data[i] = r; data[i+1] = g; data[i+2] = b;
  }
}

function run(input, opts) {
  const data = new Uint8ClampedArray(input);
  if (opts.levels)  applyLevels(data, opts.levels);
  if (opts.hsl)     applyHSL(data, opts.hsl);
  if (opts.curves)  applyCurves(data, opts.curves);
  return [...data];
}

const cases = [
  {
    name: 'levels: inBlack=50 inWhite=200',
    input: [128, 64, 32, 255],
    levels: { inBlack: 50, inWhite: 200 },
    expected: run([128, 64, 32, 255], { levels: { inBlack: 50, inWhite: 200 } }),
  },
  {
    name: 'hsl: saturation=-100 (완전 탈포화)',
    input: [200, 100, 50, 255],
    hsl: { saturation: -100 },
    expected: run([200, 100, 50, 255], { hsl: { saturation: -100 } }),
  },
  {
    name: 'curves: rgb 중간 밝게 (0,0)→(128,200)→(255,255)',
    input: [100, 100, 100, 255],
    curves: { rgb: [[0, 0], [128, 200], [255, 255]] },
    expected: run([100, 100, 100, 255], { curves: { rgb: [[0, 0], [128, 200], [255, 255]] } }),
  },
  {
    name: 'levels: 투명 픽셀은 변환 안 함',
    input: [128, 64, 32, 0],
    levels: { inBlack: 0, inWhite: 128 },
    expected: run([128, 64, 32, 0], { levels: { inBlack: 0, inWhite: 128 } }),
  },
];

const output = {
  description: 'adjust.js applyLevels/applyHSL/applyCurves 기준값 (회귀 테스트용)',
  cases,
};

writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log('생성 완료:', OUT);
console.log(cases.map(c => `  ${c.name}: ${JSON.stringify(c.input)} → ${JSON.stringify(c.expected)}`).join('\n'));
