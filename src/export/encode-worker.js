// 인코더 워커 (모듈 워커) — APNG / WebP / GIF.
// 메시지: { type:'encode', format, width, height, frames:[{buf,delayMs}], loops, options }
//   → { type:'result', buf, bytes }  (buf는 transfer)
// 진행률: { type:'progress', done, total }
// 취소:   { type:'cancel' } 수신 → { type:'cancelled' }
//
// 사파리 회피: WebP는 캔버스 Blob 변환에 기대지 않고 libwebp(wasm)로 직접 인코딩한다(사파리 엔진은 PNG를 돌려줌).

import './webp-env-shim.js'; // vendor/webp(emscripten) 로드 전에 워커 환경을 보정 — 반드시 먼저
import UPNG from '../../vendor/upng/index.js';
import { GifWriter } from '../../vendor/omggif/index.js';
import { encodeAnimation } from '../../vendor/webp/index.js';

let _cancel = false;

// ── APNG acTL num_plays 패치 (UPNG 기본값 0=무한) ──────────────────────
const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function _crc32(dv, offset, len) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < len; i++) crc = _crcTable[(crc ^ dv.getUint8(offset + i)) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function _patchApngLoops(buf, loops) {
  const dv = new DataView(buf);
  let offset = 8;
  while (offset + 12 <= dv.byteLength) {
    const len = dv.getUint32(offset);
    const type = String.fromCharCode(
      dv.getUint8(offset + 4), dv.getUint8(offset + 5), dv.getUint8(offset + 6), dv.getUint8(offset + 7));
    if (type === 'acTL') {
      if (offset + 20 <= dv.byteLength) {
        dv.setUint32(offset + 12, loops);                      // num_plays
        const crc = _crc32(dv, offset + 4, 4 + len);
        dv.setUint32(offset + 4 + len + 4, crc);
      }
      return;
    }
    if (type === 'IEND') break;
    offset += 12 + len;
  }
}

// ── WebP ANIM 청크 반복 횟수 패치 (encodeAnimation은 반복 인자가 없어 기본 무한) ──
function _patchWebpLoops(bytes, loops) {
  // RIFF(4) size(4) WEBP(4) 이후 청크들. 'ANIM' 청크 data: bgcolor(4) + loop_count(2 LE).
  let off = 12;
  const n = bytes.length;
  while (off + 8 <= n) {
    const fourcc = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = bytes[off + 4] | (bytes[off + 5] << 8) | (bytes[off + 6] << 16) | (bytes[off + 7] << 24);
    if (fourcc === 'ANIM') {
      const lc = Math.max(0, Math.min(65535, loops));
      bytes[off + 8 + 4] = lc & 0xFF;
      bytes[off + 8 + 5] = (lc >> 8) & 0xFF;
      return;
    }
    off += 8 + size + (size & 1); // 홀수 크기는 1바이트 패딩
  }
}

// ── APNG ──────────────────────────────────────────────────────────────
function encodeApng(frames, w, h, loops, options) {
  const bufs   = frames.map((f) => f.buf);
  const delays = frames.map((f) => Math.max(1, Math.round(f.delayMs)));
  const colors = options?.colors ?? 0; // 0=무손실
  const buf = UPNG.encode(bufs, w, h, colors, delays);
  if (!buf || buf.byteLength === 0) throw new Error('APNG 인코딩 결과가 비어 있습니다.');
  if (loops !== 0 && bufs.length > 1) _patchApngLoops(buf, loops);
  return buf;
}

// ── WebP ────────────────────────────────────────────────────────────────
async function encodeWebp(frames, w, h, loops, options) {
  const lossless = options?.lossless ? 1 : 0;
  const quality  = Math.max(0, Math.min(100, options?.quality ?? 80));
  const animFrames = frames.map((f) => ({
    duration: Math.max(1, Math.round(f.delayMs)),
    data: new Uint8Array(f.buf),
    config: { lossless, quality },
  }));
  const bytes = await encodeAnimation(w, h, true, animFrames);
  const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
  _patchWebpLoops(u8, loops); // loops: 0=무한
  // transfer 가능한 ArrayBuffer로 정규화
  const out = u8.buffer.byteLength === u8.byteLength ? u8.buffer : u8.slice().buffer;
  return out;
}

// ── GIF ───────────────────────────────────────────────────────────────
function encodeGif(frames, w, h, loops, options, UPNGmod) {
  const bufs = frames.map((f) => f.buf);
  // 255색 양자화 + 투명 1색. 팔레트는 UPNG 양자화를 재사용.
  const q = UPNGmod.quantize(bufs, 255, true);

  const palette = [];               // 0xRRGGBB
  const packedToIndex = new Map();
  for (const leaf of q.plte) {
    const packed = leaf.est.rgba >>> 0;
    const a = (packed >>> 24) & 0xFF;
    if (a < 128) continue;          // 투명 leaf는 색으로 쓰지 않음
    if (packedToIndex.has(packed)) continue;
    if (palette.length >= 255) break;
    const r = packed & 0xFF, g = (packed >>> 8) & 0xFF, b = (packed >>> 16) & 0xFF;
    packedToIndex.set(packed, palette.length);
    palette.push((r << 16) | (g << 8) | b);
  }
  const transparentIndex = palette.length;
  palette.push(0x000000);
  let size = 2;
  while (size < palette.length) size <<= 1;
  while (palette.length < size) palette.push(0x000000);

  const nf = frames.length;
  // GIF 지연은 1/100초 단위. 누적 반올림으로 전체 길이 드리프트를 줄인다.
  const delaysCs = [];
  let cumMs = 0, prevCs = 0;
  for (const f of frames) {
    cumMs += f.delayMs;
    const cs = Math.round(cumMs / 10);
    delaysCs.push(Math.max(1, cs - prevCs));
    prevCs = cs;
  }

  const out = new Uint8Array(w * h * 2 * nf + nf * 256 + palette.length * 3 + 4096);
  const gifLoop = (loops === 1) ? undefined : loops; // once → 넷스케이프 블록 없음, 0 → 무한
  const gw = new GifWriter(out, w, h, gifLoop === undefined ? { palette } : { loop: gifLoop, palette });

  for (let i = 0; i < nf; i++) {
    if (_cancel) throw new Error('취소됨');
    const orig  = new Uint8Array(bufs[i]);
    const qview = new Uint32Array(q.bufs[i]);
    const idx = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      if (orig[p * 4 + 3] < 128) { idx[p] = transparentIndex; continue; }
      const ix = packedToIndex.get(qview[p] >>> 0);
      idx[p] = ix === undefined ? 0 : ix;
    }
    gw.addFrame(0, 0, w, h, idx, { delay: delaysCs[i], transparent: transparentIndex, disposal: 2 });
    self.postMessage({ type: 'progress', done: i + 1, total: nf });
  }
  const end = gw.end();
  return out.slice(0, end).buffer;
}

// ── 메시지 핸들러 ──────────────────────────────────────────────────────
self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') { _cancel = true; self.postMessage({ type: 'cancelled' }); return; }
  if (msg.type !== 'encode') return;

  _cancel = false;
  const { format, width, height, frames, loops = 0, options = {} } = msg;
  try {
    self.postMessage({ type: 'progress', done: 0, total: frames.length });
    let buf;
    if (format === 'apng')      buf = encodeApng(frames, width, height, loops, options);
    else if (format === 'webp') buf = await encodeWebp(frames, width, height, loops, options);
    else if (format === 'gif')  buf = encodeGif(frames, width, height, loops, options, UPNG);
    else throw new Error('알 수 없는 형식: ' + format);

    if (_cancel) { self.postMessage({ type: 'cancelled' }); return; }
    self.postMessage({ type: 'progress', done: frames.length, total: frames.length });
    self.postMessage({ type: 'result', buf, bytes: buf.byteLength }, [buf]);
  } catch (err) {
    if (_cancel || /취소/.test(err?.message ?? '')) { self.postMessage({ type: 'cancelled' }); return; }
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};

// 모듈 평가 완료(webp-wasm 등 top-level await 포함) 뒤에 준비 신호를 보낸다.
// 모듈 워커는 TLA 동안 도착한 메시지를 잃을 수 있어, 메인은 'ready' 후에 encode를 보낸다.
self.postMessage({ type: 'ready' });
