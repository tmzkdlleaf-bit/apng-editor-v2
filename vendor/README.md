# vendor/

외부 라이브러리는 파일로 둔다. 실행 중 외부 CDN에서 코드를 받지 않는다(구글 폰트 CSS만 예외).
각 폴더의 `index.js`는 번들러 없이 모듈 워커/브라우저에서 바로 `import` 할 수 있게 감싼 ES 모듈이다.
원본 파일(UPNG.js, pako.min.js, omggif.js, webp-wasm.*)은 **고치지 않는다**.

| 폴더 | 파일 | 출처 | 버전 | 라이선스 |
| ---- | ---- | ---- | ---- | ---- |
| upng/   | UPNG.js      | https://github.com/photopea/UPNG.js | old/public/UPNG.js 기준 복사 | MIT |
| pako/   | pako.min.js  | https://github.com/nodeca/pako | 2.1.0 (minified) | MIT AND Zlib |
| omggif/ | omggif.js    | https://github.com/deanm/omggif | 커밋 기준 복사 | MIT |
| webp/   | webp-wasm.js, webp-wasm.wasm, index.js | npm `wasm-webp` (libwebp WebPAnimEncoder) | 0.1.0 | MIT |

## ES 모듈 감싸개 메모

- `pako/index.js` — pako.min.js(UMD)를 side-effect import 하고 `globalThis.pako`를 default export.
- `upng/index.js` — pako를 먼저 올린 뒤 UPNG.js를 side-effect import, `globalThis.UPNG`를 default export.
- `omggif/index.js` — omggif.js는 `exports.GifWriter`로만 노출하므로, `exports-shim.js`로 `globalThis.exports`를
  먼저 깔고 정적 import 한 뒤 `GifWriter`/`GifReader`를 named export. **top-level await를 쓰지 않는다**
  (모듈 워커는 TLA 동안 도착한 메시지를 잃을 수 있어 레이스가 생긴다).

## webp (wasm-webp@0.1.0) — 수정·주의

- `dist/esm/`의 `webp-wasm.js`, `webp-wasm.wasm`, `index.js`를 복사했다.
- **한 줄 수정**: `index.js`의 `import Module from './webp-wasm'` → `import Module from './webp-wasm.js'`
  (번들러 없이 import하려면 확장자가 필요). 그 외 webp-wasm.js/.wasm은 원본 그대로.
- `encodeAnimation(width, height, hasAlpha, frames)` — frames=[{duration, data:Uint8Array(RGBA), config:{lossless,quality}}].
  **반복 횟수 인자가 없어 기본이 무한 반복**이다. 반복 횟수는 결과 WebP의 `ANIM` 청크 2바이트를
  직접 고쳐 쓴다(`src/export/encode-worker.js`의 `_patchWebpLoops`).
- emscripten은 `typeof importScripts == 'function'`으로 워커를 감지한다. **모듈 워커에는 importScripts가 없어**
  '셸' 환경으로 오판하고 wasm을 못 읽는다. `src/export/webp-env-shim.js`가 워커에서 더미 importScripts를
  깔아(실호출 안 함) 워커(=fetch) 경로를 타게 한다. 이 shim은 webp import보다 먼저 평가되어야 한다.
