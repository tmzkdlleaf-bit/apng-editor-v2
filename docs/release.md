# 데스크톱 릴리스 (Tauri 2)

브라우저 앱(`src/`)을 Tauri 2로 포장해 윈도우 설치형 앱으로 낸다.
이 환경에는 Rust/Cargo가 없어 로컬에서는 빌드를 검증하지 못한다 →
**빌드 검증은 GitHub Actions의 `release` 워크플로로 한다.**

## 확인한 공식 문서

- Tauri 2 GitHub Actions 배포 가이드: https://v2.tauri.app/distribute/pipelines/github/
- tauri-action (빌드·릴리스 액션): https://github.com/tauri-apps/tauri-action — 핀 태그 `@v1`
  (최신 릴리스 `action-v1.0.0`, 이동 태그 `v1`)
- 빌드만 하기(릴리스 생성 안 함): `tagName`·`releaseName`·`releaseId` 를 비우면
  tauri-action 이 빌드까지만 수행한다(tauri-action README). 산출물은 `actions/upload-artifact` 로 올린다.

## 워크플로 (`.github/workflows/release.yml`)

트리거 두 가지:

| 트리거 | 동작 |
| --- | --- |
| `workflow_dispatch` (수동 실행) | 릴리스 없이 **빌드만** → 설치 파일을 아티팩트로 업로드 |
| `v*` 태그 push | 실제 릴리스 생성(초안, draft) + 설치 파일 첨부 |

`tagName` 을 `github.ref` 로 분기한다: 태그 push면 그 태그로 릴리스, 수동 실행이면 빈 값 → 빌드만.
지금 matrix 는 `windows-latest` 하나(윈도우 설치형 앱 확인이 목표). mac/linux 는 주석 참고.

## 빌드만 돌려 확인하는 법 (수동 실행)

GitHub → Actions → **release** → **Run workflow** → 브랜치 `main` 선택 → 실행.
끝나면 실행 페이지 하단 **Artifacts** 의 `apng-editor-windows-latest` 를 내려받아 `.exe`/`.msi` 확인.
(CLI: `gh workflow run release.yml --ref main`)

## 실제 릴리스 내는 법

1. `package.json` 의 `version` 을 올린다(tauri.conf.json 이 `../package.json` 을 읽음).
2. `git tag vX.Y.Z && git push origin vX.Y.Z`
3. 워크플로가 설치 파일을 만들어 **draft 릴리스**에 첨부한다. GitHub 릴리스 페이지에서 내용 확인 후 publish.

## 로컬 빌드(선택, Rust 필요)

이 저장소 환경엔 Rust 가 없다. 로컬에서 하려면:
`rustup` + "Visual Studio C++ Build Tools" 설치 후 `npx @tauri-apps/cli@2 build`.
(Tauri CLI 는 규칙상 devDependencies 에 넣지 않고 `npx` 로 부른다.)

## 자동 업데이트(updater)

기본 꺼짐. 켜려면 서명 키 생성 + `src-tauri/Cargo.toml` 의 updater/process 주석 해제 +
`src-tauri/src/lib.rs` 에 updater 플러그인 등록 2줄 + `tauri.conf.json` 의 `plugins.updater` 설정.
앱 쪽은 `src/ui/update-banner.js` / `src/platform/index.js` 의 `checkUpdate()` 가 이미 대응한다.
