// ag-psd (MIT) — PSD 읽기. vendor/ag-psd/README.md 참고(출처·버전·재생성 방법).
// bundle.js 는 ag-psd 가 배포하는 자체 포함 UMD 번들(base64-js·pako 포함).
// 모듈/AMD 가 없는 환경에선 전역(self/window)에 agPsd 를 붙인다.
// 이 래퍼는 그 전역을 ES 모듈 export 로 다시 노출한다. 네트워크를 쓰지 않는다.
import './bundle.js';

const _g = (typeof self !== 'undefined' ? self
  : typeof globalThis !== 'undefined' ? globalThis
  : window);
const agPsd = _g.agPsd;

if (!agPsd || typeof agPsd.readPsd !== 'function') {
  throw new Error('ag-psd 번들을 불러오지 못했습니다.');
}

export const readPsd = agPsd.readPsd;
export default agPsd;
