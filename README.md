# APNG 에디터 v2 — 2단계(코어) 작업 지시문

## 준비

1. 새 폴더를 만듭니다. 예: `apng-editor-v2/`
2. 기존 에디터 코드를 그 안의 `old/` 폴더에 통째로 넣습니다.
   (`old/src/...`, `old/public/...`가 되도록)
3. 이 zip의 `CLAUDE.md`를 새 폴더 맨 위에 둡니다.
4. 새 폴더에서 Claude Code를 엽니다.

## 진행

`P1-뼈대.md`부터 순서대로 내용을 Claude Code에 붙여 넣습니다.

- 묶음마다 Claude Code는 작업 후 **보고하고 멈춥니다.**
- 보고의 확인 방법대로 직접 열어 보신 뒤, 괜찮으면 다음 파일을 붙여 넣습니다.
- 문제가 있으면 다음 묶음으로 넘어가지 말고 그 자리에서 고치게 합니다.

| 파일 | 내용 |
| --- | --- |
| P1-뼈대.md | 폴더, 화면 틀, 테마, 테스트 환경 |
| P2-문서-되돌리기.md | 문서 구조, 명령, 되돌리기 |
| P3-애니메이션.md | 값 계산, 이징, 클립 |
| P4-렌더-엔진.md | renderFrame, 캐시, 보정, 성능 측정 |
| P5-캔버스-조작.md | 선택·이동·크기·회전·스냅, 숫자 칸 |
| P6-타임라인.md | 재생, 레이어 행, 클립, 키프레임, 속성 패널 배치 |
| P7-저장.md | IndexedDB, 자동 저장, 프로젝트 파일 |

설계 근거는 "APNG 에디터 재제작 — 코어 설계" 문서에 있습니다.

## 데스크톱 앱 빌드 (E4, Tauri 2)

같은 웹 코드를 Tauri 2로 감싸 윈도우/맥/리눅스 설치형 앱으로 낸다. 프론트엔드는 그대로이고
`src-tauri/`가 네이티브 껍데기다. 파일 경계는 `src/platform/index.js` 한 곳으로 모았다
(`window.__TAURI__`가 있으면 데스크톱, 없으면 웹 동작 — 웹판에 영향 없음).

### 필요한 것 (이 프로젝트엔 포함되지 않음)

- Rust 툴체인: https://rustup.rs
- 윈도우: Microsoft C++ Build Tools, WebView2(윈도우 11은 기본 포함)
- Tauri CLI는 devDependencies에 넣지 않는다(테스트·서버 도구만 둔다는 규칙). `npx`로 쓴다.

### 명령

```
npm run build                     # 웹 정적 파일을 dist/ 로 (Tauri 가 번들할 대상)
npx @tauri-apps/cli@2 dev         # 개발 실행 (npm run dev + 네이티브 창)
npx @tauri-apps/cli@2 build       # 설치 파일 빌드 (윈도우: .msi/.exe)
```

`tauri.conf.json`은 `beforeDevCommand`/`beforeBuildCommand`로 위 npm 스크립트를 자동 실행한다.
앱 버전은 루트 `package.json`의 `version`을 읽는다.

### 데스크톱에서 달라지는 동작

- 내보내기 저장·프로젝트 불러오기: **Rust 명령이 네이티브 대화상자를 직접 열고** 사용자가 고른
  경로에만 쓴다(`src-tauri/src/lib.rs`의 `save_with_dialog`/`open_project_with_dialog`).
  JS 는 경로를 만들지도 넘기지도 않는다(이름·확장자·원시 바이트만) → 웹뷰 코드가 임의 경로에 쓰는 일 차단.
  바이트는 숫자 배열이 아니라 Tauri 2 원시 바이트 전달(ArrayBuffer 본문)로 보낸다.
- 프로젝트 파일 끌어다 놓기는 웹/데스크톱 공용.

### 자동 업데이트 (켜져 있음, 키만 넣으면 작동)

UI(`src/ui/update-banner.js`) · 경계(`platform/checkUpdate`) · 플러그인(updater/process) · 설정
(`tauri.conf.json`의 `createUpdaterArtifacts`·`plugins.updater`)이 모두 들어가 있다.
남은 것은 **서명 키뿐**: 키를 만들어 저장소 시크릿에 넣고 공개 키를 `pubkey`에 붙이면 작동한다.
키가 없으면 수동 빌드는 업데이트 산출물만 건너뛰고, 태그 릴리스는 한국어 오류로 멈춘다.
전체 절차는 `docs/release.md` 참고.

### 아이콘

`src-tauri/icons/`는 `make-icons.mjs`(Node 기본 모듈만)로 생성한 자리표시 아이콘이다.
리브랜딩하려면 그 파일의 색/모양을 고치고 `node src-tauri/icons/make-icons.mjs`를 다시 실행한다.
빌드가 아이콘을 거부하면 표준 생성기로 다시 만든다: `npx @tauri-apps/cli@2 icon src-tauri/icons/icon.png`.

> 주의: 개발 환경에 Rust가 없어 Tauri 빌드는 이 저장소에서 아직 실행·검증되지 않았다.
> 스키마·설정은 Tauri 2 문서 기준으로 작성했다. 첫 빌드 전 위 툴체인을 설치해야 한다.
