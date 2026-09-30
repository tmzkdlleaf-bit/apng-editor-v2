# vendor/

| 파일 | 출처 | 버전 |
| ---- | ---- | ---- |
| UPNG.js | https://github.com/photopea/UPNG.js | 커밋 기준 복사 (old/public/UPNG.js) |
| pako.min.js | https://github.com/nodeca/pako | 2.x minified (old/public/pako.min.js) |
| omggif.js | https://github.com/deanm/omggif | 커밋 기준 복사 (old/public/omggif.js) |

## ag-psd

ag-psd (PSD 파싱/내보내기)는 브라우저에서 바로 쓸 수 있는 단일 파일 빌드가 npm에 포함되어 있지 않다.
번들러 없이 쓰려면 직접 롤업으로 빌드해야 하는데, 이는 4단계(PSD 가져오기)에서 처리한다.
그때까지 이 폴더에 포함하지 않는다.
