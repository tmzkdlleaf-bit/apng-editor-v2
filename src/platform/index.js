// 플랫폼 경계 — 웹이면 브라우저 방식, 데스크톱(Tauri)이면 Tauri 방식.
// 다른 코드는 여기만 부른다. window.__TAURI__ 가 없으면 전부 웹 동작(웹판 무영향).
// 번들러 없음: Tauri JS API는 npm import 대신 전역 window.__TAURI__ (withGlobalTauri)로 쓴다.

const LAST_DIR_KEY = 'apng2.lastSaveDir';

export function isDesktop() {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

function _tauri() { return window.__TAURI__; }

function _dirOf(path) {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i >= 0 ? path.slice(0, i) : '';
}
function _getLastDir() { try { return localStorage.getItem(LAST_DIR_KEY) || ''; } catch { return ''; } }
function _setLastDir(dir) { try { if (dir) localStorage.setItem(LAST_DIR_KEY, dir); } catch {} }

// 파일 이름에서 확장자 하나를 뽑는다(저장 대화상자 필터 제안용).
function _extOf(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

// ── 파일 저장 ───────────────────────────────────────────────────────────
// 웹: 다운로드. 데스크톱: Rust 명령 save_with_dialog 가 저장 대화상자를 직접 열고,
// 사용자가 고른 경로에만 바이트를 쓴다. JS 는 경로를 만들지도 넘기지도 않는다
// (이름 제안·확장자·바이트만 보냄 → 웹뷰 코드가 임의 경로에 쓰는 일을 원천 차단).
// 바이트는 숫자 배열(Array.from) 대신 Tauri 2 의 원시 바이트 전달(ArrayBuffer 본문)로 보낸다.
// 메타(이름·확장자·마지막 폴더)는 헤더로 보내되, 한글이 섞일 수 있어 encodeURIComponent 로 ASCII 화한다.
// 반환: { saved, canceled?, path? }
export async function saveFile(name, blob) {
  if (!isDesktop()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
    return { saved: true, path: null };
  }
  const { core } = _tauri();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = await core.invoke('save_with_dialog', bytes, {
    headers: {
      'x-default-name': encodeURIComponent(name),
      'x-extension':    _extOf(name),
      'x-last-dir':     encodeURIComponent(_getLastDir()),
    },
  });
  if (!path) return { saved: false, canceled: true };
  _setLastDir(_dirOf(path));
  return { saved: true, path };
}

// ── 프로젝트 파일 열기(데스크톱) ─────────────────────────────────────────
// Rust 명령 open_project_with_dialog 가 열기 대화상자를 직접 열고, 고른 파일을 읽어 돌려준다.
// JS 는 역시 경로를 넘기지 않는다. 반환: { path, text } 또는 null(취소/웹).
export async function openProjectFile() {
  if (!isDesktop()) return null;
  const { core } = _tauri();
  const picked = await core.invoke('open_project_with_dialog', { dir: _getLastDir() });
  if (!picked) return null;
  _setLastDir(_dirOf(picked.path));
  return { path: picked.path, text: picked.text };
}

// ── 자동 업데이트 확인 ───────────────────────────────────────────────────
// 반환: { version, notes, installAndRestart(flush) } 또는 null(없음/오프라인/웹).
// 확인 실패(오프라인 등)는 조용히 null.
export async function checkUpdate() {
  if (!isDesktop()) return null;
  const tauri = _tauri();
  const updater = tauri.updater;
  if (!updater?.check) return null;
  let update;
  try {
    update = await updater.check();
  } catch {
    return null; // 오프라인 등은 조용히 넘어간다
  }
  if (!update || update.available === false) return null;
  return {
    version: update.version,
    notes: update.body ?? update.notes ?? '',
    raw: update,
    // 설치 전 flush() 를 기다린 뒤 내려받아 설치하고 재시작.
    async installAndRestart(flush) {
      try { if (flush) await flush(); } catch {}
      await update.downloadAndInstall();
      if (tauri.process?.relaunch) await tauri.process.relaunch();
    },
  };
}
