// 모듈 워커 환경 보정 — vendor/webp(emscripten) 로드 전에 평가되어야 한다.
// emscripten은 `typeof importScripts == 'function'`으로 워커를 감지한다. 모듈 워커에는
// importScripts가 없어 '셸' 환경으로 오판하고 wasm을 fetch로 읽지 못한다.
// 실제로 호출되지는 않는 더미를 깔아 워커(=fetch) 경로를 타게 한다. 원본 vendor는 고치지 않는다.
if (typeof globalThis.importScripts !== 'function' &&
    typeof globalThis.window === 'undefined' &&
    typeof WorkerGlobalScope !== 'undefined') {
  globalThis.importScripts = () => {
    throw new Error('importScripts는 모듈 워커에서 지원되지 않습니다(환경 감지용 더미).');
  };
}
