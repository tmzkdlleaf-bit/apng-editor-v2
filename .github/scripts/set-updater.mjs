// CI 전용: 빌드 직전에 updater 산출물 생성을 켤지 끌지 정한다.
// 인자: <isTag> <hasKey>  (각각 "true"/"false" 문자열)
//
// - 태그 릴리스(isTag=true)인데 서명 키 시크릿이 없거나(hasKey=false) 공개 키가 아직 자리표시자면
//   → 명확한 한국어 오류로 멈춘다. (조용히 '업데이트 안 되는 앱'을 릴리스하지 않기 위해.)
// - 빌드만 하는 수동 실행(isTag=false)에서 키가 없으면
//   → createUpdaterArtifacts=false 로 바꿔 서명 없이 빌드만 통과시킨다(산출물은 건너뜀).
// - 키가 있으면 createUpdaterArtifacts=true (서명된 업데이트 산출물 생성).
import { readFileSync, writeFileSync } from 'node:fs';

const isTag = process.argv[2] === 'true';
const hasKey = process.argv[3] === 'true';
const PLACEHOLDER = '__REPLACE_WITH_UPDATER_PUBKEY__';
const path = 'src-tauri/tauri.conf.json';

const cfg = JSON.parse(readFileSync(path, 'utf8'));
const pubkey = cfg.plugins?.updater?.pubkey ?? '';
const pubkeyReady = pubkey && pubkey !== PLACEHOLDER;

if (isTag && (!hasKey || !pubkeyReady)) {
  const missing = [];
  if (!hasKey) missing.push('서명 개인 키 시크릿(TAURI_SIGNING_PRIVATE_KEY)');
  if (!pubkeyReady) missing.push('공개 키(src-tauri/tauri.conf.json 의 plugins.updater.pubkey)');
  console.error(
    `::error::자동 업데이트 릴리스를 만들 수 없습니다. 설정되지 않은 것: ${missing.join(', ')}. ` +
    `docs/release.md 의 "1) 서명 키 만들기" / "2) 저장소 시크릿" / "3) 공개 키 넣기" 를 끝낸 뒤 다시 태그를 올리세요. ` +
    `(키 없이 릴리스하면 설치한 사용자에게 업데이트를 보낼 수 없습니다.)`,
  );
  process.exit(1);
}

cfg.bundle = cfg.bundle || {};
cfg.bundle.createUpdaterArtifacts = hasKey;
writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
console.log(
  `updater 산출물: createUpdaterArtifacts=${hasKey} ` +
  `(isTag=${isTag}, hasKey=${hasKey}, pubkeyReady=${pubkeyReady})`,
);
