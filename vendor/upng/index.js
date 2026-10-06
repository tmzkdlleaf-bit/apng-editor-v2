// UPNG.js (MIT) — ES 모듈 감싸개. 원본은 고치지 않는다.
// UPNG는 self.pako를 읽으므로 먼저 pako를 올려 globalThis.pako에 노출한 뒤 UPNG.js를 평가한다.
// 정적 import는 소스 순서대로, 각 모듈 본문보다 먼저 완전히 평가되므로 순서가 보장된다.
import '../pako/pako.min.js';
import './UPNG.js';
export default globalThis.UPNG;
