# 데스크톱 릴리스 · 자동 업데이트 (Tauri 2)

브라우저 앱(`src/`)을 Tauri 2로 포장해 윈도우 설치형 앱으로 낸다.
이 환경에는 Rust/Cargo가 없어 로컬에서는 빌드를 검증하지 못한다 →
**빌드 검증은 GitHub Actions의 `release` 워크플로로 한다.**

확인한 공식 문서:
- 업데이터: https://v2.tauri.app/plugin/updater/
- CSP: https://v2.tauri.app/security/csp/
- Rust 호출(원시 바이트): https://v2.tauri.app/develop/calling-rust/
- 설정 레퍼런스: https://v2.tauri.app/reference/config/
- tauri-action: https://github.com/tauri-apps/tauri-action (핀 태그 `@v1`)

---

## 빌드만 돌려 확인 (서명 키 없이)

GitHub → Actions → **release** → **Run workflow** → 브랜치 `main` → 실행.
끝나면 실행 페이지 하단 **Artifacts** 의 `apng-editor-windows-latest` 에서 `.exe`/`.msi` 확인.
(CLI: `gh workflow run release.yml --ref main`)

> 서명 키가 없으면 수동 실행은 `createUpdaterArtifacts` 를 자동으로 꺼서(= 업데이트 산출물 건너뜀)
> 설치 파일만 만든다. 태그 릴리스에서 키가 없으면 **한국어 오류로 멈춘다**(`.github/scripts/set-updater.mjs`).

---

# 자동 업데이트 릴리스 — Nabi가 할 일

아래는 **처음 한 번** 준비(1~3)하고, 그 뒤로는 새 버전마다 4번만 반복하면 된다.

## 1) 서명 키 만들기 (처음 한 번)

Node가 있는 컴퓨터에서 아래를 그대로 실행한다. **비밀번호를 물으면 정해서 입력**한다(엔터로 빈 비밀번호도 가능하지만, 비밀번호를 두는 쪽을 권장).

PowerShell:

```powershell
npx @tauri-apps/cli@2 signer generate -w "$env:USERPROFILE\.tauri\apng-editor.key"
```

- 개인 키 파일: `C:\Users\<사용자>\.tauri\apng-editor.key`
- 공개 키 파일: 같은 위치에 `apng-editor.key.pub` 로 함께 생성(공개 키 문자열은 화면에도 출력된다).

> **이 키를 잃어버리면 이미 설치한 사용자에게 업데이트를 보낼 수 없다.**
> `apng-editor.key`(개인 키)와 비밀번호를 비밀번호 관리자 등에 **따로 백업**할 것. 저장소에 올리지 말 것.

## 2) GitHub 저장소 시크릿 등록 (처음 한 번)

저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 **2개**를 만든다.

| 이름(Name) | 값(Secret) |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 개인 키 파일 `apng-editor.key` 의 **내용 전체**(파일을 열어 전부 복사해 붙여넣기) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 1번에서 정한 **비밀번호**(빈 비밀번호면 빈칸으로 두되, 시크릿 자체는 만들어 둘 것) |

## 3) 공개 키 넣기 (처음 한 번)

`src-tauri/tauri.conf.json` 을 열어 `plugins.updater.pubkey` 의 자리표시자를 공개 키로 바꾼다.

```jsonc
"plugins": {
  "updater": {
    "pubkey": "여기에 apng-editor.key.pub 내용(또는 1번 출력된 공개 키)을 그대로 붙여넣기",
    "endpoints": [
      "https://github.com/tmzkdlleaf-bit/apng-editor-v2/releases/latest/download/latest.json"
    ]
  }
}
```

(자리표시자 원래 값: `__REPLACE_WITH_UPDATER_PUBKEY__`)
바꾼 뒤 커밋·push 한다. 공개 키는 비밀이 아니므로 저장소에 올라가도 된다.

## 4) 새 버전 내기 (매번)

```powershell
npm version patch          # package.json 버전 올리고 커밋+태그(vX.Y.Z) 자동 생성
git push --follow-tags     # 커밋과 태그를 함께 push → release 워크플로가 돈다
```

- Actions → **release** 가 끝나면 → 저장소 **Releases** 에 **초안(draft)** 릴리스가 생긴다.
- 내용(설치 파일 `.exe`/`.msi`, `latest.json`, 서명 `.sig` 가 첨부됐는지) 확인 후 **Publish** 한다.

> **초안 상태에서는 업데이트가 가지 않는다.** `endpoints` 의 `releases/latest/...` 는
> "가장 최신 **published** 릴리스"만 가리키므로, 초안을 **Publish 해야** 설치된 앱이 `latest.json` 을 보고 업데이트한다.
> (프리릴리스로 표시해도 `latest` 로 안 잡힌다. 정식 릴리스로 Publish 할 것.)

## 5) 업데이트가 실제로 되는지 확인

1. 현재 버전(예: 0.1.0) 설치 파일로 설치하고 앱을 닫는다.
2. 버전을 올려(0.1.1) 4번으로 릴리스를 만들고 **Publish** 한다.
3. 설치해 둔 0.1.0 앱을 실행한다. **약 10초 뒤** 상단에 "새 버전 0.1.1" 버튼이 뜬다.
   누르면 릴리스 노트 → "지금 설치하고 다시 시작" 으로 업데이트된다(설치 전 작업이 자동 저장된다).

## 6) 설치할 때 "Windows의 PC 보호" 경고

코드 서명 인증서(별도 유료)가 없어, 설치 파일을 처음 받는 사용자에게
**"Windows의 PC 보호 — 알 수 없는 게시자"** (SmartScreen) 경고가 뜬다. 바이러스라서가 아니라,
"아직 널리 설치되지 않은, 서명 안 된 설치 파일" 이라는 뜻이다.

사용자에게 줄 안내 문구(그대로 복사해서 써도 된다):

> 설치 파일을 실행하면 "Windows의 PC 보호" 창이 뜰 수 있습니다.
> **[추가 정보]** 를 누른 뒤 아래 **[실행]** 버튼을 누르면 설치됩니다.
> (코드 서명 인증서가 없어 생기는 경고이며, 안전합니다.)

> 참고: 업데이트 자체는 Tauri 가 공개 키로 서명을 검증하므로, 위조된 업데이트는 설치되지 않는다.
> SmartScreen 경고를 없애려면 별도의 코드 서명 인증서가 필요하다(이번 범위 밖).

---

## 워크플로 요약 (`.github/workflows/release.yml`)

| 트리거 | 동작 |
| --- | --- |
| `workflow_dispatch` (수동) | 릴리스 없이 **빌드만**. 키 없으면 updater 산출물 끄고 설치 파일만 아티팩트 업로드 |
| `v*` 태그 push | **draft 릴리스** 생성 + 설치 파일·`latest.json`·서명 첨부. 키 없으면 한국어 오류로 중단 |

지금 matrix 는 `windows-latest` 하나. mac/linux 는 workflow 주석 참고.

## 로컬 빌드(선택, Rust 필요)

이 저장소 환경엔 Rust 가 없다. 로컬에서 하려면 `rustup` + "Visual Studio C++ Build Tools" 설치 후:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\apng-editor.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<비밀번호>"
npx @tauri-apps/cli@2 build
```

(Tauri CLI 는 규칙상 devDependencies 에 넣지 않고 `npx` 로 부른다.)
