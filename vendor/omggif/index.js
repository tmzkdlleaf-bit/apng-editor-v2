// omggif (MIT) — ES 모듈 감싸개. 원본은 고치지 않는다.
// 원본은 CommonJS exports로만 노출한다(try{ exports.GifWriter=... }). 모듈로 평가하면
// 최상위 함수가 전역으로 새지 않으므로, globalThis.exports를 미리 깔아 그리로 받아낸다.
// 정적 import만 쓴다(top-level await 금지 — 모듈 워커의 메시지 전달 레이스를 피한다).
import './exports-shim.js'; // globalThis.exports를 먼저 깐다
import './omggif.js';       // 정적 — globalThis.exports.GifWriter/GifReader 설정
export const GifWriter = globalThis.exports.GifWriter;
export const GifReader = globalThis.exports.GifReader;
