// IndexedDB 저수준 래퍼 — 저장소: projects(id→레코드), assets(id→{id,blob}),
//   snapshots(id→{id,projectId,createdAt,label,doc,thumb,auto,bytes}) — 저장 시점(R12-3),
//   library(id→{id,name,createdAt,layers,rootId,assetIds,assets,thumb}) — 내 부품(R14-3).
// DOM을 쓰지 않는다(워커/테스트에서 그대로 사용 가능). indexedDB는 워커에도 있다.

const DB_NAME = 'apng-editor-v2';
const DB_VER  = 3; // v2(R12-3): snapshots · v3(R14-3): library 저장소 추가

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      // 기존 저장소는 유지하고 없는 것만 만든다(데이터 보존). 뒤 버전에서 스키마가 바뀌면 여기서 이관.
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets'))   db.createObjectStore('assets',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) {
        const ss = db.createObjectStore('snapshots', { keyPath: 'id' });
        ss.createIndex('byProject', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'id' });
    };
    // 다른 탭이 더 높은 버전으로 열려고 하면(onblocked) 우리가 먼저 닫아 길을 비운다.
    req.onblocked = () => { try { _dbPromise = null; } catch {} };
    req.onsuccess = (e) => {
      const db = e.target.result;
      // 다른 탭이 버전 업그레이드를 시작하면 이 연결을 닫아 막지 않는다.
      db.onversionchange = () => { try { db.close(); } catch {} _dbPromise = null; };
      resolve(db);
    };
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// 쓰기 트랜잭션 — 완료(oncomplete)까지 기다린다. 용량 부족은 onabort/onerror로 전달된다.
async function _write(store, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    let out;
    try { out = fn(tx.objectStore(store)); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(out);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

async function _read(store, fn) {
  const db = await openDB();
  return fn(db.transaction(store, 'readonly').objectStore(store));
}

// ── 프로젝트 레코드 ────────────────────────────────────────────────────
export async function getProject(id)  { return _read('projects', os => _req(os.get(id))); }
export async function putProject(rec)  { return _write('projects', os => os.put(rec)); }
export async function deleteProject(id){ return _write('projects', os => os.delete(id)); }
export async function listProjects()   { return _read('projects', os => _req(os.getAll())); }

// ── 에셋 Blob ──────────────────────────────────────────────────────────
export async function getAssetBlob(id) {
  const rec = await _read('assets', os => _req(os.get(id)));
  return rec?.blob ?? null;
}
// savedAt: 저장 시각(ms). 시작 정리가 "최근에 저장된 고아"를 건드리지 않게 한다(다른 탭·미저장 변경 보호).
export async function putAssetBlob(id, blob, savedAt = Date.now()) { return _write('assets', os => os.put({ id, blob, savedAt })); }
export async function getAssetSavedAt(id) {
  const rec = await _read('assets', os => _req(os.get(id)));
  return rec?.savedAt ?? 0;
}
export async function deleteAssetBlob(id)    { return _write('assets', os => os.delete(id)); }
export async function allAssetIds()          { return _read('assets', os => _req(os.getAllKeys())); }
export async function hasAssetBlob(id) {
  const key = await _read('assets', os => _req(os.getKey(id)));
  return key !== undefined;
}

// ── 저장 시점(snapshots, R12-3) ──────────────────────────────────────────
export async function putSnapshot(rec)   { return _write('snapshots', os => os.put(rec)); }
export async function getSnapshot(id)    { return _read('snapshots', os => _req(os.get(id))); }
export async function deleteSnapshot(id) { return _write('snapshots', os => os.delete(id)); }
export async function listAllSnapshots() { return _read('snapshots', os => _req(os.getAll())); }
// 한 프로젝트의 시점만(byProject 인덱스).
export async function listSnapshots(projectId) {
  return _read('snapshots', os => _req(os.index('byProject').getAll(projectId)));
}
export async function deleteSnapshotsByProject(projectId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const idx = tx.objectStore('snapshots').index('byProject');
    const req = idx.openKeyCursor(projectId);
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { tx.objectStore('snapshots').delete(cur.primaryKey); cur.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ── 내 부품(library, R14-3) ──────────────────────────────────────────────
export async function putLibraryPart(rec)   { return _write('library', os => os.put(rec)); }
export async function getLibraryPart(id)     { return _read('library', os => _req(os.get(id))); }
export async function deleteLibraryPart(id)  { return _write('library', os => os.delete(id)); }
export async function listLibraryParts()     { return _read('library', os => _req(os.getAll())); }

// 테스트/정리용 — 전체 비우기
export async function clearAll() {
  await _write('projects', os => os.clear());
  await _write('assets',   os => os.clear());
  const db = await openDB();
  if (db.objectStoreNames.contains('snapshots')) await _write('snapshots', os => os.clear());
  if (db.objectStoreNames.contains('library'))   await _write('library',   os => os.clear());
}

export { DB_NAME };
