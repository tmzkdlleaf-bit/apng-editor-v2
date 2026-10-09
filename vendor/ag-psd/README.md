# ag-psd (vendored)

PSD 읽기/쓰기 라이브러리. MIT 라이선스(`LICENSE` 참고).

- 출처: https://www.npmjs.com/package/ag-psd
- 버전: 31.0.3
- 파일:
  - `bundle.js` — ag-psd 가 npm 패키지로 함께 배포하는 자체 포함 UMD 번들
    (`dist/bundle.js` 그대로. base64-js·pako 등 의존성이 이미 안에 포함되어 외부 의존이 없다).
  - `index.js` — 이 저장소에서 쓰는 ES 모듈 래퍼. `bundle.js` 를 불러와 전역(`self.agPsd`)에
    붙은 API 를 `export` 로 다시 노출한다. 네트워크를 쓰지 않는다.

## 재생성 방법

```
npm pack ag-psd@31.0.3
tar -xzf ag-psd-31.0.3.tgz
cp package/dist/bundle.js vendor/ag-psd/bundle.js
cp package/LICENSE        vendor/ag-psd/LICENSE
```

`index.js` 는 직접 작성한 래퍼이므로 덮어쓰지 않는다.

## 사용 메모

- 워커(`src/core/io/psd-worker.js`)에서만 쓴다. `document` 가 없으므로
  `agPsd.initializeCanvas(createCanvas, createImageData)` 로 OffscreenCanvas 기반 생성기를 주입한다.
- `readPsd(buffer, { useImageData:true, skipCompositeImageData:true })` 로 캔버스 대신
  `imageData`(스트레이트 알파) 를 받아 PNG 로 인코딩한다.
