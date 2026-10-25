// CRC-32 (IEEE 802.3) — PNG 청크·ZIP 항목 체크섬 공용. DOM 없음(워커·테스트·메인 공용).
// encode-worker 의 acTL 패치와 zip.js 가 같은 구현을 쓰도록 여기로 모았다(R13-2).

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

// bytes: 인덱스로 바이트를 읽을 수 있는 것(Uint8Array). start·len 으로 구간만 계산할 수 있다.
export function crc32(bytes, start = 0, len = bytes.length - start) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < len; i++) crc = TABLE[(crc ^ bytes[start + i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export { TABLE as CRC_TABLE };
