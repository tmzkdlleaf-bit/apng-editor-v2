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
function _join(dir, name) {
  if (!dir) return name;
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}
function _getLastDir() { try { return localStorage.getItem(LAST_DIR_KEY) || ''; } catch { return ''; } }
function _setLastDir(dir) { try { if (dir) localStorage.setItem(LAST_DIR_KEY, dir); } catch {} }

// 파일 확장자로 저장 대화상자 필터를 만든다.
function _filtersFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    png:      { name: 'APNG · PNG', extensions: ['png'] },
    webp:     { name: 'WebP',       extensions: ['webp'] },
    gif:      { name: 'GIF',        extensions: ['gif'] },
    apngproj: { name: '프로젝트',    extensions: ['apngproj'] },
    json:     { name: 'JSON',       extensions: ['json'] },
  };
  return map[ext] ? [map[ext]] : [];
}

// ── 파일 저장 ───────────────────────────────────────────────────────────
// 웹: 다운로드. 데스크톱: 저장 대화상자(dialog 플러그인) → 커스텀 명령으로 바이트 쓰기.
// 파일 쓰기를 fs 플러그인이 아니라 Rust 커스텀 명령(write_file_bytes)으로 하는 이유:
// fs 플러그인은 스코프에 적힌 경로만 허용해 임의 드라이브(D: 등)에 저장이 막힌다. 커스텀 명령은 제약이 없다.
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
  const { dialog, core } = _tauri();
  const lastDir = _getLastDir();
  const path = await dialog.save({
    defaultPath: _join(lastDir, name),
    filters: _filtersFor(name),
  });
  if (!path) return { saved: false, canceled: true };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await core.invoke('write_file_bytes', { path, contents: Array.from(bytes) });
  _setLastDir(_dirOf(path));
  return { saved: true, path };
}

// ── 프로젝트 파일 열기(데스크톱) ─────────────────────────────────────────
// 반환: { path, text } 또는 null(취소). 웹에서는 null(웹은 파일 입력 사용).
export async function openProjectFile() {
  if (!isDesktop()) return null;
  const { dialog, core } = _tauri();
  const picked = await dialog.open({
    multiple: false, directory: false,
    filters: [{ name: '프로젝트', extensions: ['apngproj', 'json'] }],
  });
  if (!picked) return null;
  const path = typeof picked === 'string' ? picked : picked.path;
  const text = await core.invoke('read_file_text', { path });
  _setLastDir(_dirOf(path));
  return { path, text };
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
