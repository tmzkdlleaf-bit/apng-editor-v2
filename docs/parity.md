# 4단계 패리티 점검표 (old → v2)

기존 에디터(`old/`)의 기능을 v2에서 어디에 어떻게 옮겼는지 100개 항목으로 정리한다.
상태: **완료** = v2에 구현·테스트됨 / **5단계** = 다음 단계로 미룸(계약은 잡아 둠) / **삭제** = v2 규칙상 빼기로 결정.

실제 공식 체크리스트가 들어오면 이 표를 그에 맞춰 갱신한다. 지금은 F1~F5 묶음 범위에서 작성.

| 번호 | 항목 | 새 위치 | 상태 | 테스트 |
|---|---|---|---|---|
| 1 | 다크/라이트 테마, 토큰 변수 | `src/styles/tokens.css`, `ui/shell/theme.js` | 완료 | u0-icons / p1-shell |
| 2 | 테마 선적용(FOUC 방지) | `index.html` 인라인 스크립트 | 완료 | u0-screens |
| 3 | 3분할 셸(좌 레이어/중앙 캔버스/우 인스펙터/하단 타임라인) | `ui/shell/shell.js` | 완료 | p1-shell |
| 4 | 상단 프로젝트 이름 메뉴 | `ui/shell/shell.js` | 완료 | f5-projects |
| 5 | 드롭다운/메뉴 동작 | `ui/shell/*` | 완료 | u0-dropdown |
| 6 | 아이콘 세트(이모지 금지) | `ui/shell/icons.js` | 완료 | u0-icons |
| 7 | 상태줄·토스트 알림 | `ui/shell/status.js` | 완료 | e3-export-ui |
| 8 | 인스펙터 패널 틀 | `ui/inspector/index.js` | 완료 | u0-inspector |
| 9 | 단일 진실 문서 스키마 | `core/doc/schema.js` | 완료 | p2-doc |
| 10 | 명령으로만 변경(`store.apply`) | `core/doc/store.js`, `commands.js` | 완료 | p2-doc |
| 11 | 패치 기반 알림(범위 통지) | `core/doc/store.js` | 완료 | p2-patch |
| 12 | 되돌리기/다시하기 | `core/doc/store.js` | 완료 | p2-doc |
| 13 | begin→임시→commit 1건 기록 | `core/doc/store.js` | 완료 | f1-adjust |
| 14 | 레이어 추가/삭제/이동 | `commands.js` | 완료 | p2-doc |
| 15 | 다중 선택·일괄 속성 | `ui/inspector/*`, `editor-state.js` | 완료 | f1-info / f1-multi |
| 16 | 레이어 속성 편집(blend·opacity·visible·lock) | `commands.js setLayer` | 완료 | p2-doc |
| 17 | 문서 마이그레이션 | `core/io/migrate.js` | 완료 | p7-storage |
| 18 | 편집 상태(선택·재생·배율)와 문서 분리 | `ui/editor-state.js` | 완료 | p5-canvas |
| 19 | 단일 렌더 함수 `renderFrame` | `core/render/frame.js` | 완료 | p4-render |
| 20 | 미리보기·내보내기 동일 경로 | `core/render/*`, `export/encode.js` | 완료 | e1-export |
| 21 | 결정론(Math.random/Date.now 금지) | `core/render/*` | 완료 | f4-effects-core |
| 22 | seed 난수기 | `core/render/rng.js` | 완료 | f4-effects-core |
| 23 | 심리스 루프(frame 0 == N) | `core/anim/seam.js`, 렌더 | 완료 | f4-effects-core / f1-fx |
| 24 | 캔버스 풀(렌더 중 생성 금지) | `core/render/pool.js` | 완료 | p4-fix |
| 25 | `ctx.filter` 미사용(직접 픽셀 보정+캐시) | `core/render/adjust.js` | 완료 | f1-adjust |
| 26 | 변환(위치·배율·회전·알파) | `core/render/*` | 완료 | p4-render |
| 27 | 블렌드 모드 12종 | `core/render/*` | 완료 | p4-render |
| 28 | 배경(투명/단색) | `core/doc/schema.js`, 렌더 | 완료 | p4-render |
| 29 | 캔버스 확대/축소·이동 | `ui/canvas/*` | 완료 | p5-canvas |
| 30 | 레이어 선택(클릭·히트 테스트) | `ui/canvas/hit.js` | 완료 | p5-canvas |
| 31 | 이동 드래그 | `ui/canvas/*` | 완료 | p5-canvas |
| 32 | 크기/회전 핸들 | `ui/canvas/*` | 완료 | p5-fix3 |
| 33 | 이미지 끌어다 놓기 | `ui/layer-add.js setupDropTarget` | 완료 | p5-fix4 |
| 34 | 기준점(anchor) 편집 | `ui/canvas/*`, 그룹 pivot | 완료 | f2-group-pivot |
| 35 | 격자·스냅 | `ui/canvas/*`, `editorState.gridStep` | 완료 | f2-align |
| 36 | 눈금/가이드 표시 | `ui/canvas/*` | 완료 | p5-canvas |
| 37 | 타임라인 틀·눈금 | `ui/timeline/*` | 완료 | p6-timeline |
| 38 | 재생/정지·플레이헤드 | `ui/timeline/*`, `playback` | 완료 | p6-timeline |
| 39 | 키프레임 추가/이동/삭제 | `commands.js setKey/moveKeys/removeKey` | 완료 | p6-timeline |
| 40 | 키프레임 이징(linear~cubicBezier) | `core/anim/easing.js` | 완료 | f3-easing |
| 41 | 커스텀 베지어 편집 | `ui/inspector/*`, 저장 유지 | 완료 | f3-easing |
| 42 | 키 리타이밍·일괄 이동 | `commands.js retimeKeys/moveKeys` | 완료 | p6-timeline |
| 43 | 레이어 행 썸네일 | `ui/timeline/layer-list.js` | 완료 | f2-thumbnail |
| 44 | 썸네일 캐시(스크럽 중 렌더 0회) | `ui/timeline/*` | 완료 | f2-thumbnail |
| 45 | 행 우클릭 메뉴(복제 등) | `ui/timeline/*` | 완료 | f2-instance |
| 46 | fps·프레임 수·반복 설정 | `core/doc/schema.js`, 내보내기 | 완료 | e4-loops |
| 47 | 이미지 원본 IndexedDB 저장 | `core/io/idb.js`, `assets.js` | 완료 | p7-storage |
| 48 | 내용 주소 에셋(SHA-256, 중복 제거) | `core/io/assets.js` | 완료 | p7-storage |
| 49 | 자동 저장 | `core/io/autosave.js` | 완료 | p7-storage |
| 50 | 프로젝트 파일 내보내기/가져오기(.apngproj) | `core/io/project-file.js` | 완료 | p7-storage |
| 51 | 고아 에셋 정리 | `core/io/assets.js purgeOrphanAssets` | 완료 | f5-projects |
| 52 | 프로젝트 목록(열기·복제·이름·삭제·썸네일·정렬) | `ui/library.js`, `app.js projectApi` | 완료 | f5-projects |
| 53 | 복제 독립성(한쪽 수정 영향 없음) | `app.js duplicateProject` | 완료 | f5-projects |
| 54 | 이름 바꾸기 → 내보내기 파일명 반영 | `app.js renameProject` | 완료 | f5-projects |
| 55 | 삭제 시 에셋 purge | `app.js deleteProject` | 완료 | f5-projects |
| 56 | 저장 공간 부족 안내(quota) | `core/io/autosave.js` | 완료 | p7-storage |
| 57 | 이미지 레이어 | `ui/layer-add.js`, `core/render/layers/image.js` | 완료 | p5-fix4 |
| 58 | 움직이는 이미지(GIF·APNG·WebP) 가져오기 | `core/io/anim-decode.js`, `layers/anim.js` | 완료 | f2-anim |
| 59 | anim 시간 기준 프레임 선택 | `core/render/layers/anim.js` | 완료 | f2-anim |
| 60 | 글자 레이어 | `core/render/layers/text.js` | 완료 | f1-text |
| 61 | 글자 테두리·그림자 | `layers/text.js` | 완료 | f1-text |
| 62 | 글자 캔버스 편집(더블클릭) | `ui/canvas/*` | 완료 | f1-text |
| 63 | 타자기/글자별 애니 | `layers/text.js` reveal/charAnim | 완료 | f1-text |
| 64 | 도형 레이어(사각·타원·다각·path·선) | `ui/shapes-pack.js`, `layers/shape.js` | 완료 | f1-shape |
| 65 | 도형 채움(단색·그라디언트) | `layers/shape.js` | 완료 | f1-shape |
| 66 | 조정 레이어(아래 전체 보정) | `core/render/layers/adjust-layer.js` | 완료 | f2-shapes-adjust |
| 67 | 이미지 보정(밝기·흐림·색 덮기·외곽선) | `core/render/adjust.js` | 완료 | f1-adjust / f1-fx |
| 68 | 트랙 매트/마스크 | `core/render/mask.js`, 소스 슬롯 | 완료 | f1-fx / f4-loopcheck-mask |
| 69 | 그룹(변환 컨테이너·pivot) | `ui/group-ops.js`, `commands.js group` | 완료 | f2-group-pivot |
| 70 | 컴포넌트/인스턴스(master+override) | `commands.js`, 렌더 전개 | 완료 | f2-instance |
| 71 | 카메라(위치·줌 키프레임) | `commands.js setCameraProp`, `ui/inspector/camera-section.js` | 완료 | f2-camera |
| 72 | 정렬·분배 | `ui/inspector/align-section.js` | 완료 | f2-align |
| 73 | 모션 계약(레지스트리) | `src/motions/contract.js`, `registry.js` | 완료 | f3-motion-contract |
| 74 | 클립(윈도우·루프·gain·ease) | `core/doc/schema.js createClip`, `core/anim/clip.js` | 완료 | f3-clip |
| 75 | 클립 자르기/삭제/복제 | `commands.js splitClip/removeClip/duplicateClip` | 완료 | f3-clip |
| 76 | 모션 갤러리·파라미터 노브 | `ui/inspector/motion-section.js` | 완료 | f3-motion-section |
| 77 | 경로 모션(키 점·직선화) | `src/motions/*`, `ui/canvas/path-edit.js` | 완료 | f3-path |
| 78 | 모션 녹화(그려서 경로 생성) | `ui/motion-record.js` | 완료 | f3-record |
| 79 | 키 단순화(reduceKeys) | `ui/motion-record.js`, `src/motions/*` | 완료 | f3-record |
| 80 | 도구(옮기기·편집·움직이기·손) + 단축키 | `ui/tools/*`, `keys.js` | 완료 | f3-tools |
| 81 | 이펙트 레이어 틀·갤러리(분류·검색) | `ui/effect-gallery.js`, `effects/registry.js` | 완료 | f4-effect-ui |
| 82 | 이펙트 파라미터 UI(모든 타입) | `ui/inspector/*` | 완료 | f4-effect-ui |
| 83 | 이펙트 시드(다시 생성·재현) | `effects/*` | 완료 | f4-effects-core |
| 84 | 이펙트 범위(박스)·소스 슬롯 | `effects/*`, 렌더 | 완료 | f4-effect-ui |
| 85 | 루프 이음새 검사(Ctrl+Shift+L) | `ui/loop-check.js`, `core/anim/seam.js` | 완료 | f4-loopcheck-mask |
| 86 | 이펙트 45종 전체 이식 | `effects/*` (현재 시험 효과 3종) | 5단계 | f4-effects-core(시험 3종) |
| 87 | APNG 인코더(무손실·renderFrame 일치) | `export/encode-worker.js`, `vendor/upng` | 완료 | e1-export |
| 88 | WebP 인코더(libwebp wasm, 사파리 회피) | `vendor/webp`, worker | 완료 | e1-export |
| 89 | GIF 인코더 | `vendor/omggif` | 완료 | e1-export |
| 90 | 핑퐁/루프·같은 프레임 병합·여백 트림 | `export/*` | 완료 | e1-export |
| 91 | 용도 프리셋·목표 용량 자동 맞추기 | `export/fit.js` | 완료 | e2-fit |
| 92 | 여러 형식 한 번에·굽기 공유·취소 | `export/*` | 완료 | e2-fit |
| 93 | 내보내기 모달 UI(형식별 칸·파일명·MIME) | `ui/export/index.js` | 완료 | e3-export-ui |
| 94 | 데스크톱(Tauri) 저장/열기/업데이트 | `platform/*` | 완료 | e4-desktop |
| 95 | PSD 가져오기(폴더→그룹, blend/opacity/숨김) | `ui/psd-import.js`, `core/io/psd*.js`, `vendor/ag-psd` | 완료 | f5-psd |
| 96 | PSD 블렌드 매핑·미지원 경고·텍스트 래스터화 | `core/io/psd.js` | 완료 | f5-psd |
| 97 | 시작 템플릿·캔버스 프리셋 | `ui/templates.js` | 완료 | f5-projects |
| 98 | 처음 사용 안내(3단계)·다시 보기 | `ui/help.js` | 완료 | f5-help |
| 99 | 단축키 도움말(keys.js 한 소스·검색) | `ui/shortcuts.js`, `ui/help.js` | 완료 | f5-help |
| 100 | 오프라인 설치(PWA·서비스 워커·새 버전 안내) | `sw.js`, `manifest.webmanifest`, `app.js` | 완료 | f5-pwa |

## 5단계로 미룬 것(계약은 잡아 둠)

- 이펙트 45종 전체(현재는 시험 효과 3종으로 계약만 검증 — 86번).
- 모션/효과 프리셋 데이터와 에셋 팩(템플릿 내용은 `ui/templates.js` 한 파일에 두고 5단계에서 교체 — 97번).
- 페인트/래스터 레이어, 펜 도구 고급 편집.

## v2 규칙상 뺀 것(삭제)

- 클라우드 동기화: v2는 백엔드 없음·작업물은 브라우저 밖으로 안 나감(CLAUDE.md). old의 `cloud.js` 기능은 넣지 않는다.
- 런타임 CDN 로딩: 외부 코드는 모두 `vendor/` 파일로 둔다(구글 폰트 CSS만 예외). old의 `esm.sh/ag-psd` 동적 import는 벤더 번들로 대체(95번).
