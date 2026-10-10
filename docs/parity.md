# 기능 동등성 체크리스트 (old → v2)

검수 쪽 원문(100개 항목)을 기준으로 다시 작성했다. 각 항목에 **상태 · 새 위치(UI 경로) · 확인 테스트**를 적는다.

- 상태: **완료**(v2에 구현·테스트됨) / **5단계**(다음 단계로, 계약만 잡음) / **삭제됨**(v2 규칙상 뺌) / **미완료**(이번 범위에서 미구현).
- 새 위치는 코드 파일이 아니라 사용자가 보는 경로(예: "속성 패널 › 보정 › 고급")로 적되, 근거 파일을 괄호에 둔다.
- 제외(9/30 결정): 효과 48종·효과 조합 템플릿·모션 프리셋 37종의 "내용"은 5단계에서 제작. 그 틀만 여기 둔다.

## 레이어 추가와 가져오기

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 이미지 추가(여러 장·끌어 놓기) | 완료 | 타임라인 › [+ 레이어] › 이미지 / 캔버스에 드롭 (`ui/layer-add.js`) | p5-fix4 |
| GIF·APNG 가져오기 → 움직이는 레이어(PNG 자동 판별, 실패 시 정지) | 완료 | [+ 레이어] › 움직이는 이미지 (`core/io/anim-decode.js`) | f2-anim |
| PSD 가져오기(레이어 분리·폴더→그룹·blend/opacity/숨김·캔버스 크기) | 완료 | 프로젝트 메뉴 또는 드롭 (`ui/psd-import.js`, `vendor/ag-psd`) | f5-psd |
| 글자 레이어 추가 | 완료 | [+ 레이어] › 글자 (`core/render/layers/text.js`) | f1-text |
| 도형 레이어(사각·원·선·다각형) | 완료 | [+ 레이어] › 도형 격자 (`ui/shapes-pack.js`) | f1-shape / f2-shapes-adjust |
| 조정 레이어(아래 전체 보정) | 완료 | [+ 레이어] › 조정 (`core/render/layers/adjust-layer.js`) | f2-shapes-adjust |
| 효과 레이어(갤러리·클릭 배치) | 완료(갤러리) / 5단계(클릭 배치 P모드) | [+ 레이어] › 이펙트 → 갤러리 (`ui/effect-gallery.js`) | f4-effect-ui |
| 에셋 팩 9종(별·하트·십자 등) | 완료 | [+ 레이어] › 도형 격자 (`ui/shapes-pack.js`) | f2-shapes-adjust |

## 레이어 관리

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 선택(클릭·Ctrl·Shift 범위) | 완료 | 레이어 목록 / 캔버스 (`ui/timeline/layer-list.js`) | p6-timeline |
| 캔버스 클릭 → 맨 위 레이어 선택 | 완료 | 캔버스 (`ui/canvas/hit.js`) | p5-canvas |
| 순서 변경(드래그) | 완료 | 레이어 목록 드래그 (G2) | p6-fix3 |
| 표시/숨기기·삭제(그룹 삭제 시 자식 남음) | 완료 | 행 눈 아이콘·우클릭 (`layer-list.js`) | p6-timeline |
| 레이어 썸네일 | 완료 | 레이어 목록 행 (`ui/timeline/thumbnail.js`) | f2-thumbnail |
| 그룹 묶기·풀기·접기/펼치기 | 완료 | 우클릭·Ctrl+G (`ui/group-ops.js`) | p6-fix3 |
| 그룹 내부 편집(더블클릭 진입·Esc) | 완료 | 캔버스 (`ui/canvas/*`, groupEdit) | p5-canvas |
| 컴포넌트/인스턴스(override) | 완료 | 우클릭 › 컴포넌트/인스턴스 (`ui/component-ops.js`) | f2-instance |
| 레이어별 클립 목록(펼침·선택·삭제) | 완료 | 레이어 목록 펼침 행 · 움직임 섹션 | p6-fix2 / f3-clip |
| (신규) 레이어 복제 | 완료 | 우클릭 › 복제 · Ctrl+D (`keys.js`) | p6-fix3 |
| (신규) Delete 로 삭제 | 완료 | Delete (`keys.js`) | f3-clip |
| (신규) 복사·붙여넣기(Ctrl+C/V) | 완료 | `keys.js` | p6-fix2 |
| (신규) 방향키 1px·Shift 10px 이동, `,`/`.` 프레임 | 완료 | `keys.js` | p5-fix3 / p6-timeline |
| (신규) 레이어 잠금(선택·이동 방지) | 완료 | 행 잠금 아이콘·우클릭 (`layer-list.js`, 렌더·드래그 존중) | p6-timeline |

## 캔버스 직접 조작

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 이동 드래그(Shift 축 고정) | 완료 | 캔버스 옮기기(V) (`ui/canvas/drag.js`) | p5-canvas |
| 크기·회전 핸들(Shift 15°) | 완료 | 캔버스 핸들 | p5-fix3 |
| 스냅(그리드·경계·중앙·레이어·3분할, Alt 해제) | 완료 | 캔버스 (`ui/canvas/snap.js`) | p5-canvas |
| 그리드 표시(G)·간격 8~128 | 완료 | 캔버스 › 보기 메뉴(그리드·간격·스냅) (item 7, `ui/canvas/view.js`) | f2-align |
| 확대·축소(휠·Ctrl±·맞춤·100%) | 완료 | 캔버스 (`ui/canvas/view.js`) | p5-canvas |
| 화면 이동(Space+드래그·손 도구) | 완료 | 캔버스 손(H) | p5-canvas |
| 정렬·분배(하나면 캔버스 기준) | 완료 | 속성 패널 › 정렬 (`ui/inspector/align-section.js`) | f2-align |
| 조작 모드(옮기기 V·편집 E·움직이기 P·손 H) | 완료 | 캔버스 좌상단 도구(아이콘 개선 item 8) (`ui/canvas/view.js`, `keys.js`) | f3-tools |
| 캔버스 위 모션 경로(점·끝점 끌어 그 키만 수정) | 완료 | 캔버스 편집(E) (`ui/canvas/path-edit.js`) | f3-path |
| 클립 선택 중 레이어 끌면 클립 평행이동 | 완료 | 캔버스 (`ui/canvas/*`) | f3-path |

## 레이어 속성(속성 패널)

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 공통(이름·표시·블렌드 12종·불투명도) | 완료 | 모습 섹션 (`ui/inspector/appearance-section.js`) | p2-doc |
| 변환(X·Y·크기·회전·불투명도 + 키프레임 마름모) | 완료 | 배치 섹션 (`ui/inspector/layout-section.js`) | p6-fix2 |
| 보정(밝기·대비·채도·색조·흐림) | 완료 | 보정 (`ui/inspector/adjust-section.js`) | f1-adjust |
| 고급 보정(레벨·HSL·커브·초기화) | 완료 | 보정 › 고급 | f1-adjust |
| 색조 덮기 | 완료 | 색덮기 (`ui/inspector/fx-sections.js`) | f1-fx |
| 트랙 매트(알파·루마, 소스 고르기) | 완료 | 트랙 매트 (`core/render/mask.js`) | f1-fx |
| 소산 퇴장 | 완료 | 흩어지며 퇴장 (image·anim) | f1-fx |
| 아웃라인(색·두께·품질) | 완료 | 외곽선(image; 도형·글자는 자체 외곽선) | f1-fx |
| 경로 직선화 | 완료 | 움직임 › 경로 직선화 | f3-path |
| 글자(내용·폰트6·크기·굵기·색·정렬·줄간격·자간) | 완료 | 글자 섹션 (`ui/inspector/text-section.js`) | f1-text |
| 글자 테두리·그림자 | 완료 | 글자 섹션 | f1-text |
| 타자기·글자별 애니(1회/반복/핑퐁) | 완료 | 글자 섹션 (`layers/text.js`) | f1-text |
| 도형(종류·W·H·채움·그라디언트·선·둥글기·꼭짓점) | 완료 | 도형 섹션 (`ui/inspector/shape-section.js`) | f1-shape |
| 움직이는 이미지(소스 정보·타이밍·속도·오프셋) | 완료 | 움직이는 이미지 섹션 (`ui/inspector/anim`… `info-sections.js`) | f2-anim |
| 그룹(변환·피벗·자식 수) | 완료 | 그룹 섹션 (`ui/inspector/group-section.js`) | f2-group-pivot |
| 카메라(X·Y·줌 키프레임) | 완료 | 레이어 머리칸 › 카메라 (`ui/inspector/camera-section.js`) | f2-camera |
| 여러 선택(정렬·분배·모션 일괄) | 완료 | 속성 패널(혼합 값) | f1-multi |

## 모션·키프레임·클립

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 이징 19종 + 커스텀 베지어 | 완료 | 이징 메뉴(곡선 그림·베지어 편집) (`core/anim/easing.js`) | f3-easing |
| 모션 프리셋 틀(갤러리·노브·다시 적용) | 완료(틀) / 5단계(프리셋 37종 내용) | 움직임 › + 모션 추가 → 큰 갤러리(item 4) (`ui/motion-gallery.js`) | f3-motion-section |
| 기존 키 덮어쓰기 전 확인 | 완료 | 움직임 섹션 | f3-motion-section |
| 클립 편집(시작·길이·속도·진폭·이징) | 완료 | 움직임 › 선택 클립 편집 | f3-motion-section |
| 클립 루프 토글(끝=시작, 회전 360°) | 완료 | 클립 우클릭 · 편집 | f3-clip |
| 자동 키(끄면 트랙 평행이동) | 완료 | 재생줄 자동키 (`core/doc/*`) | p6-timeline |
| 모션 기록(재생 중 드래그 녹화) | 완료 | 재생줄 기록 버튼(item 6 "기록 중") (`ui/motion-record.js`) | f3-record |
| 키 단순화(reduceKeys) | 완료 | 모션 기록 내부 | f3-record |
| 클립 삭제 시 원래 값 복원 | 완료 | `core/anim/clip.js` | f3-clip |

## 타임라인·재생

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 재생·멈춤(Space)·처음/끝·이전/다음(←→,.) | 완료 | 재생줄 (`ui/timeline/index.js`) | p6-timeline / u0-timeline-align |
| 재생 방식(반복·1회·핑퐁) | 완료 | 재생줄 반복 아이콘 3 | p6-timeline |
| FPS·프레임 수·길이 | 완료 | 상단바 캔버스 정보·설정 | p6-timeline |
| 스크럽(드래그) | 완료 | 트랙 머리줄 (`track-canvas.js`) | p6-timeline |
| 키프레임 추가/삭제/이동 | 완료 | 트랙 (`track-canvas.js`) | p6-timeline |
| 키 다중 선택(Shift·박스)·복사/붙여넣기·삭제 | 완료 | 트랙 (`track-canvas.js`, `keys.js`) | p6-fix2 |
| 선택 키 묶음 끝 핸들 비례 스트레치 | 완료 | 트랙 핸들 (retimeKeys) | p6-fix2 |
| 키 우클릭 → 이징 | 완료 | 트랙 우클릭 | p6-fix2 |
| 클립(이동·트림·자르기·복제·루프) | 완료 | 트랙 클립 | f3-clip |
| 타임라인 스냅 | 완료 | 재생줄 타임라인 스냅(아이콘 구분 item 6) | p6-fix2 |
| 카메라 트랙 행 | 완료 | 트랙 카메라 행 | f2-camera |
| 타임라인 열기·닫기 | 완료 | 셸 | p1-shell |
| 트랙 폭 맞춤(전체 프레임이 폭에 꼭 맞게·맞춤 버튼) | 완료 | 트랙(기본 fit·Ctrl+휠·맞춤 item 5) | review-ui |

## 효과를 담는 틀

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 효과 갤러리(분류·검색·카드) | 완료 | [+ 레이어] › 이펙트 → 큰 갤러리(item 4) | f4-effect-ui |
| 파라미터 종류(숫자·좌표·색·선택지·고급 접힘) | 완료 | 이펙트 섹션(라벨 정렬 item 3) (`ui/inspector/effect-section.js`) | f4-effect-ui |
| 시드·다시 생성 | 완료 | 이펙트 › 시드 | f4-effects-core |
| 효과 마스크(모양·반전·페더) | 완료 | 트랙 매트(effect 포함) (`core/render/layer-effect` 경로) | f4-loopcheck-mask / f1-fx |
| 소스 슬롯(다른 레이어를 재료로) | 완료 | 이펙트 › 소스 | f4-effect-ui |
| 효과 범위(전체·박스) | 완료 | 이펙트 › 범위 | f4-effect-ui |
| 효과 레이어 배치(X·Y·크기·회전 키) | 완료 | 배치 섹션 | p6-fix2 |
| 결정론·이음새 없는 루프·루프 검증(Ctrl+Shift+L) | 완료 | 루프 검사 (`core/anim/seam.js`, `ui/loop-check.js`) | f4-effects-core / f4-loopcheck-mask |
| 효과 48종 | 5단계 | — (시험 효과 3종으로 계약 검증) | f4-effects-core |

## 내보내기

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 형식(APNG·애니메이션 WebP·GIF) | 완료 | 내보내기 창 (`vendor/upng·webp·omggif`) | e1-export |
| 출력 배율 1·.75·.5·.25 | 완료 | 내보내기 창 | e1-export / e2-fit |
| 색상 수(APNG)·품질(WebP)·256색(GIF) | 완료 | 내보내기 창 | e1-export |
| 투명 여백 자동 제거 | 완료 | 내보내기 › 트림 | e1-export |
| 반복 횟수(0=무한) | 완료 | 내보내기 › 반복 | e4-loops |
| 예상 용량·목표 KB 자동 맞춤 | 완료 | 내보내기(목표에 맞추기) (`export/fit.js`) | e2-fit |
| 내보내기 프리셋(기본 2종+사용자) | 완료 | 내보내기 용도 (`export/presets.js`) | e2-fit |
| 등장·퇴장 루프 경고 | 완료 | 내보내기 경고줄 | e3-export-ui |
| 진행률·취소·로그·워커 인코딩 | 완료 | 내보내기 창 (`export/encode-worker.js`) | e3-export-ui |
| 프레임 버퍼 150MB 경고 | 완료 | `core/export/bake.js` | e1-export |
| 핑퐁·1회 내보내기 반영(옛 버그) | 완료 | `core/export/bake.js` playback | e1-export / e4-loops |

## 프로젝트 관리·보조

| 원문 항목 | 상태 | 새 위치 | 테스트 |
|---|---|---|---|
| 프로젝트 라이브러리(열기·복제·이름·삭제·썸네일·정렬) | 완료 | 프로젝트 메뉴 › 목록 (`ui/library.js`) | f5-projects |
| 자동 저장(0.5초·전환 시 즉시·quota) | 완료 | (`core/io/autosave.js`) | p7-storage |
| 안 쓰는 이미지 자동 정리 | 완료 | (`core/io/assets.js` purgeOrphanAssets) | f5-projects |
| 프로젝트 파일(.apngproj) 내보내기·불러오기(이미지 포함) | 완료 | 프로젝트 메뉴 (`core/io/project-file.js`) | p7-storage |
| 캔버스 설정(크기·비율·중앙 재배치·배경) | 완료 | 상단바 캔버스 설정 (`ui/shell/*`) | p6-timeline |
| 되돌리기·다시하기(Ctrl+Z/Y/Shift+Z) | 완료 | `core/doc/store.js` | p2-doc |
| 시작 템플릿(빈·반짝 원·빛나는 글자·루프 배경) | 완료(틀) / 5단계(내용) | 새 프로젝트 템플릿 (`ui/templates.js`) | f5-projects |
| 첫 방문 온보딩(3단계·다시 보기) | 완료 | (`ui/help.js`, 백드롭 클릭 통과 F5-6) | f5-help |
| 작업 흐름 표시줄 | 완료 | 상단바 | f5-help |
| 단축키 안내(?) — keys.js 단일 소스 | 완료 | 도움말 (`ui/shortcuts.js`) | f5-help |
| 설치형 웹앱(PWA·오프라인) | 완료 | (`sw.js`, 새 버전 안내 F5-6 수정) | f5-pwa |
| 데모 모드 메뉴(저장 안 됨 안내·새 프로젝트로 시작) | 완료 | 프로젝트 메뉴(데모, item 9) (`ui/shell/shell.js`) | u0-screens(수동) |

## 동작하지 않던 기능과 불일치 10건 — 해결 여부

| # | 원문 문제 | v2 해결 | 근거·테스트 |
|---|---|---|---|
| 1 | 효과 마스크 선택이 적용 안 됨(필드 불일치·반전/페더 미연결) | 해결 | 트랙 매트가 effect 포함, 반전·페더 연결 (`core/render/mask.js`) · f4-loopcheck-mask |
| 2 | 핑퐁·1회가 내보내기에 반영 안 됨(항상 순방향) | 해결 | `bake.js`가 playback(핑퐁/1회) 반영 · e1-export / e4-loops |
| 3 | 프로젝트 파일에 페인트 픽셀 빠짐 | 해당 없음 | 페인트 레이어 삭제(v2 규칙). 이미지 에셋은 포함(project-file) |
| 4 | 페인트 획 되돌리기 안 됨 | 해당 없음 | 페인트 도구 삭제 |
| 5 | 도형은 선택 클립 편집 패널이 안 뜸 | 해결 | 움직임 섹션이 도형 포함 모든 타입에 클립 편집 제공 · f3-motion-section |
| 6 | 단축키 안내와 실제 불일치 | 해결 | `keys.js` 단일 소스 → `shortcuts.js` 안내 · f5-help |
| 7 | 중복 UI(반복 3곳·재생 2곳) | 해결 | 재생줄 하나로 통합 (`timeline/index.js`) · p6-timeline |
| 8 | 블렌드 모드 영문 코드명 표시 | 해결 | 한국어 라벨 드롭다운 · u0-dropdown |
| 9 | PSD 가져오기가 실행 시 CDN 로딩 | 해결 | `vendor/ag-psd` 파일 번들 · f5-psd |
| 10 | 문서·코드 불일치(스키마·효과 수) | 해결 | 스키마 단일 소스(`core/doc/schema.js`), 이 표가 코드 기준 |

## 버벅거림의 코드상 원인 — v2 구조의 대응

| 원문 원인 | v2 대응 | 근거·테스트 |
|---|---|---|
| 미리보기 원본 해상도·보조표시 같은 캔버스에 그림 | 장면/오버레이 캔버스 분리 + draft(저해상도) 모드 (`ui/canvas/stage.js`) | p5-canvas |
| 보정 매 프레임 CPU 계산 | ctx.filter 금지, 직접 픽셀 보정 후 캐시 (`core/render/adjust.js`, `cache.js`) | f1-adjust |
| 값 하나 바뀌어도 모든 패널 알림 | 바뀐 범위(레이어 id·키)만 통지 (`core/doc/store.js` patch 스코프) | p2-patch |
| 패널 비교값에 현재 프레임 포함 → 매번 재생성 | 패널은 한 번 만들고 값만 갱신(스크럽 중 재생성 0) | p6-timeline(E5) / p6-fix2(18) |
| 드래그마다 문서 변경 + 전체 알림 + 자동 저장 | begin → preview(임시) → commit 1건, 드래그 중 저장 보류 | f1-adjust / p7-storage(8) |

## 5단계로 넘김(계약은 잡아 둠)

- 효과 48종 내용(시험 3종으로 계약 검증 — `docs/stage5.md`).
- 모션 프리셋 37종 내용(시험 3종).
- 시작 템플릿 내용(`ui/templates.js` 한 파일, 5단계 교체).
- 효과 레이어 캔버스 클릭 배치(P모드)·박스 핸들·coord 캔버스 점 드래그(틀만, 현재 숫자/중앙배치).

## v2 규칙상 뺀 것(삭제됨)

- 이미지 편집 도구(지우개·마법 지우개·자르기·재색상·선택·페인트·펜·패스 불리언)와 래스터·패스 레이어(9/30 결정).
- 클라우드 동기화(백엔드 없음·작업물은 브라우저 밖으로 안 나감).
- 런타임 CDN 로딩(외부 코드는 `vendor/` 파일, 구글 폰트 CSS만 예외).
- 간단/전문가 모드 분리(하나로 통합).
