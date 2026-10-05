// IndexedDB 저수준 래퍼 — 저장소: projects(id→레코드), assets(id→{id,blob})
// DOM을 쓰지 않는다(워커/테스트에서 그대로 사용 가능). indexedDB는 워커에도 있다.

const DB_NAME = 'apng-editor-v2';
const DB_VER  = 1;

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets'))   db.createObjectStore('assets',   { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
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
export async function putAssetBlob(id, blob) { return _write('assets', os => os.put({ id, blob })); }
export async function deleteAssetBlob(id)    { return _write('assets', os => os.delete(id)); }
export async function allAssetIds()          { return _read('assets', os => _req(os.getAllKeys())); }
export async function hasAssetBlob(id) {
  const key = await _read('assets', os => _req(os.getKey(id)));
  return key !== undefined;
}

// 테스트/정리용 — 전체 비우기
export async function clearAll() {
  await _write('projects', os => os.clear());
  await _write('assets',   os => os.clear());
}

export { DB_NAME };
