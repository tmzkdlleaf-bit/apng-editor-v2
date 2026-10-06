// omggif 감싸개용 — omggif.js(정적 import)보다 먼저 평가되어 globalThis.exports를 깐다.
// 그래야 omggif.js의 `try{ exports.GifWriter=... }`가 전역 exports로 들어온다(TLA 없이).
globalThis.exports = globalThis.exports || {};
