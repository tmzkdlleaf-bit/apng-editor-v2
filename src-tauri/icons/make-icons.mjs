// 데스크톱 앱 아이콘 생성기 — 외부 의존성 없이 Node 기본 모듈(zlib)만 쓴다.
// 앱 색(src/styles/tokens.css --acc #f0a35e / 어두운 패널)으로 둥근 사각형 + 재생 삼각형을 그린다.
// 실행: node src-tauri/icons/make-icons.mjs
// 리브랜딩 시 색/모양만 고치고 다시 실행하면 PNG·ICO·ICNS가 갱신된다.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

const BG   = [0x1e, 0x20, 0x24, 0xff]; // 어두운 패널
const ACC  = [0xf0, 0xa3, 0x5e, 0xff]; // 강조색
const SS   = 4;                        // 수퍼샘플(계단 완화)

// ── CRC32 (PNG 청크용) ─────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// RGBA 픽셀 버퍼 → PNG Buffer
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // 10,11,12 = 압축/필터/인터레이스 기본 0
  // 스캔라인마다 필터 바이트 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// 점이 삼각형 안인지(부호 일관성)
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// 한 변 N의 아이콘을 그려 RGBA 버퍼 반환(수퍼샘플 후 박스 평균)
function drawIcon(N) {
  const S = N * SS;
  const hi = new Uint8ClampedArray(S * S * 4);
  const r = S * 0.22;                 // 둥근 모서리 반지름
  // 재생 삼각형 꼭짓점(약간 오른쪽 균형)
  const cx = S * 0.54, cy = S * 0.5, size = S * 0.30;
  const ax = cx - size * 0.72, ay = cy - size;
  const bx = cx - size * 0.72, by = cy + size;
  const ccx = cx + size * 0.95, ccy = cy;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 둥근 사각형 마스크
      let inside = true;
      const corners = [[r, r], [S - r, r], [r, S - r], [S - r, S - r]];
      // 모서리 바깥 영역만 검사
      const nx = Math.min(Math.max(x + 0.5, r), S - r);
      const ny = Math.min(Math.max(y + 0.5, r), S - r);
      const dx = x + 0.5 - nx, dy = y + 0.5 - ny;
      if (dx * dx + dy * dy > r * r) inside = false;
      void corners;
      const o = (y * S + x) * 4;
      if (!inside) { hi[o] = hi[o + 1] = hi[o + 2] = hi[o + 3] = 0; continue; }
      const col = inTri(x + 0.5, y + 0.5, ax, ay, bx, by, ccx, ccy) ? ACC : BG;
      hi[o] = col[0]; hi[o + 1] = col[1]; hi[o + 2] = col[2]; hi[o + 3] = col[3];
    }
  }
  // 박스 다운샘플
  const out = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const a = hi[o + 3];
          rr += hi[o] * a; gg += hi[o + 1] * a; bb += hi[o + 2] * a; aa += a;
        }
      }
      const o = (y * N + x) * 4;
      if (aa === 0) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; }
      else {
        out[o] = Math.round(rr / aa);
        out[o + 1] = Math.round(gg / aa);
        out[o + 2] = Math.round(bb / aa);
        out[o + 3] = Math.round(aa / (SS * SS));
      }
    }
  }
  return out;
}

function pngOf(N) { return encodePng(N, N, drawIcon(N)); }

// ── ICO (PNG 내장) ─────────────────────────────────────────────────
function encodeIco(sizes) {
  const imgs = sizes.map((n) => ({ n, png: pngOf(n) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(imgs.length, 4);
  const dir = Buffer.alloc(16 * imgs.length);
  let offset = 6 + dir.length;
  imgs.forEach((im, i) => {
    const b = i * 16;
    dir[b] = im.n >= 256 ? 0 : im.n;      // width (256 → 0)
    dir[b + 1] = im.n >= 256 ? 0 : im.n;  // height
    dir[b + 2] = 0; dir[b + 3] = 0;       // palette, reserved
    dir.writeUInt16LE(1, b + 4);          // color planes
    dir.writeUInt16LE(32, b + 6);         // bpp
    dir.writeUInt32LE(im.png.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += im.png.length;
  });
  return Buffer.concat([header, dir, ...imgs.map((im) => im.png)]);
}

// ── ICNS (PNG 내장) ────────────────────────────────────────────────
function encodeIcns(entries) {
  const parts = entries.map(({ type, n }) => {
    const png = pngOf(n);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ── 쓰기 ───────────────────────────────────────────────────────────
const w = (name, buf) => { writeFileSync(join(DIR, name), buf); console.log('wrote', name, buf.length, 'bytes'); };

w('32x32.png', pngOf(32));
w('128x128.png', pngOf(128));
w('128x128@2x.png', pngOf(256));
w('icon.png', pngOf(512));
w('Square30x30Logo.png', pngOf(30));
w('Square44x44Logo.png', pngOf(44));
w('Square71x71Logo.png', pngOf(71));
w('Square89x89Logo.png', pngOf(89));
w('Square107x107Logo.png', pngOf(107));
w('Square142x142Logo.png', pngOf(142));
w('Square150x150Logo.png', pngOf(150));
w('Square284x284Logo.png', pngOf(284));
w('Square310x310Logo.png', pngOf(310));
w('StoreLogo.png', pngOf(50));
w('icon.ico', encodeIco([16, 32, 48, 64, 128, 256]));
w('icon.icns', encodeIcns([
  { type: 'ic07', n: 128 },
  { type: 'ic08', n: 256 },
  { type: 'ic09', n: 512 },
  { type: 'ic10', n: 1024 },
  { type: 'ic11', n: 32 },
  { type: 'ic12', n: 64 },
  { type: 'ic13', n: 256 },
  { type: 'ic14', n: 512 },
]));
console.log('icons done');
