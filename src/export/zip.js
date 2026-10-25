// 외부 라이브러리 없이 "압축 안 함(stored)" ZIP 을 직접 만든다(R13-2).
// PNG·JSON 은 이미 압축돼 있거나 작아, stored 로 묶어도 손해가 거의 없고 구현이 단순·결정적이다.
// ZIP64 는 쓰지 않는다 → 전체 4GB 이상이면 막는다. DOM 없음.
import { crc32 } from '../core/export/crc32.js';

const MAX_ZIP_BYTES = 0xFFFFFFFF; // 4GB. 넘으면 ZIP64 가 필요한데 지원하지 않는다.

function _utf8(str) {
  return new TextEncoder().encode(String(str));
}

// 고정 날짜·시각(2020-01-01 00:00:00) — 결정적 결과(같은 입력 → 같은 바이트).
const DOS_TIME = 0;                     // 00:00:00
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1; // 2020-01-01

// entries: [{ name, data: Uint8Array }] → ZIP 바이트(Uint8Array).
export function buildZip(entries) {
  const files = entries.map((e) => {
    const nameBytes = _utf8(e.name);
    const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
    return { nameBytes, data, crc: crc32(data) };
  });

  // 전체 크기 미리 계산(로컬 헤더 30 + 이름 + 데이터, 중앙 디렉터리 46 + 이름, EOCD 22).
  let localSize = 0, centralSize = 0;
  for (const f of files) {
    localSize   += 30 + f.nameBytes.length + f.data.length;
    centralSize += 46 + f.nameBytes.length;
  }
  const total = localSize + centralSize + 22;
  if (total > MAX_ZIP_BYTES) {
    const err = new Error('묶음 파일이 4GB 를 넘습니다. 크기를 줄이거나 나눠서 내보내세요.');
    err.code = 'zip-too-large';
    throw err;
  }

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = 0;
  const offsets = [];

  const u16 = (v) => { dv.setUint16(off, v, true); off += 2; };
  const u32 = (v) => { dv.setUint32(off, v >>> 0, true); off += 4; };
  const raw = (bytes) => { out.set(bytes, off); off += bytes.length; };

  // ── 로컬 파일 헤더 + 데이터 ──
  for (const f of files) {
    offsets.push(off);
    u32(0x04034b50);            // 로컬 파일 헤더 시그니처
    u16(20);                    // version needed (2.0)
    u16(0x0800);                // flags: bit 11 = 이름 UTF-8
    u16(0);                     // compression: 0 = stored
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);         // compressed size (= 원본, stored)
    u32(f.data.length);         // uncompressed size
    u16(f.nameBytes.length);
    u16(0);                     // extra field length
    raw(f.nameBytes);
    raw(f.data);
  }

  // ── 중앙 디렉터리 ──
  const centralStart = off;
  files.forEach((f, i) => {
    u32(0x02014b50);            // 중앙 디렉터리 헤더 시그니처
    u16(20);                    // version made by
    u16(20);                    // version needed
    u16(0x0800);                // flags: UTF-8
    u16(0);                     // compression: stored
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.nameBytes.length);
    u16(0);                     // extra length
    u16(0);                     // comment length
    u16(0);                     // disk number start
    u16(0);                     // internal attrs
    u32(0);                     // external attrs
    u32(offsets[i]);            // 로컬 헤더 오프셋
    raw(f.nameBytes);
  });
  const centralLen = off - centralStart;

  // ── EOCD(End Of Central Directory) ──
  u32(0x06054b50);
  u16(0);                       // this disk
  u16(0);                       // disk with central dir
  u16(files.length);            // entries on this disk
  u16(files.length);            // total entries
  u32(centralLen);
  u32(centralStart);
  u16(0);                       // comment length

  return out;
}

// 테스트·검증용: stored ZIP 을 다시 푼다(압축 안 한 것만). { name → Uint8Array }.
// 중앙 디렉터리를 읽어 각 항목의 로컬 헤더 오프셋에서 데이터를 꺼낸다.
export function readZip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // EOCD 를 뒤에서 찾는다(주석 없으면 끝에서 22바이트).
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP EOCD 를 찾을 수 없습니다.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true); // 중앙 디렉터리 시작
  const out = {};
  const td = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('중앙 디렉터리 항목이 올바르지 않습니다.');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('stored 가 아닌 항목: ' + name);
    // 로컬 헤더에서 데이터 위치 계산.
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    out[name] = u8.slice(dataStart, dataStart + compSize);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export { MAX_ZIP_BYTES };
