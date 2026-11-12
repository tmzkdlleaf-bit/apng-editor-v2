import { init as initTheme } from './ui/shell/theme.js';
import { init as initShell } from './ui/shell/shell.js';
import { createStore } from './core/doc/store.js';
import { createDoc } from './core/doc/schema.js';
import { createEditorState } from './ui/editor-state.js';
import { getProject, putProject, listProjects, deleteProject as idbDeleteProject,
  putSnapshot, getSnapshot, deleteSnapshot, listSnapshots as idbListSnapshots, deleteSnapshotsByProject } from './core/io/idb.js';
import { purgeOrphanAssets } from './core/io/assets.js';
import { makeSnapshot, pruneSnapshots, shouldAutoSnapshot } from './core/io/snapshots.js';
import { createProjectFromTemplate } from './ui/templates.js';
import { migrate } from './core/io/migrate.js';
import { buildProjectFile, importProjectFile } from './core/io/project-file.js';
import { createAutosave } from './core/io/autosave.js';
import { showToast } from './ui/shell/status.js';
import { saveFile, openProjectFile, isDesktop } from './platform/index.js';

const CUR_KEY = 'apng2.currentProject';

function _genId() {
  try { return 'prj_' + crypto.randomUUID(); } catch { return 'prj_' + Math.random().toString(36).slice(2); }
}
function _getCurrentId() { try { return localStorage.getItem(CUR_KEY); } catch { return null; } }
function _setCurrentId(id) { try { localStorage.setItem(CUR_KEY, id); } catch {} }

const demoParam = new URLSearchParams(location.search).get('demo');
const isDemo    = demoParam === '1' || demoParam === 'simple';

// ── 문서 준비 ───────────────────────────────────────────────────────────
let projectId   = null;
let projectName = '새 프로젝트';
let initialDoc;

if (demoParam === '1') {
  const { createLargeDemo } = await import('./ui/demo.js');
  initialDoc = await createLargeDemo();
} else if (demoParam === 'simple') {
  const { createDemoDoc } = await import('./ui/demo.js');
  initialDoc = createDemoDoc();
} else {
  // 마지막으로 연 프로젝트 → 없거나 깨졌으면 새 프로젝트
  const id  = _getCurrentId();
  let   rec = null;
  if (id) { try { rec = await getProject(id); } catch { rec = null; } }
  if (rec?.doc) {
    try {
      initialDoc  = migrate(rec.doc);
      projectId   = rec.id;
      projectName = rec.name || '새 프로젝트';
    } catch {
      rec = null; // 알 수 없는 버전 등 → 새 프로젝트로
    }
  }
  if (!projectId) {
    projectId   = _genId();
    projectName = '새 프로젝트';
    initialDoc  = createDoc();
    await putProject({ id: projectId, name: projectName, doc: initialDoc, updatedAt: Date.now() });
    _setCurrentId(projectId);
  }
  // 코코포리아 미리보기 배경(R14-2)은 어떤 문서도 안 쓰지만 보존한다.
  let _keepIds = [];
  try { const bg = localStorage.getItem('apng2.ccfoliaBg'); if (bg) _keepIds.push(bg); } catch {}
  try { await purgeOrphanAssets({ keepIds: _keepIds }); } catch {}
}

const store       = createStore(initialDoc);
const editorState = createEditorState();

// ── 프로젝트 조작(메뉴에서 호출) — 전환은 새 id 저장 후 새로고침 ───────────
let autosave = null;
let _lastSnapAt = 0; // 마지막 저장 시점 시각(자동 시점 간격 판단)

// 한 프로젝트의 시점 보관 정책 적용(오래된 자동 시점 삭제).
async function _pruneSnaps(id) {
  try {
    const list = await idbListSnapshots(id);
    const { removeIds } = pruneSnapshots(list);
    for (const rid of removeIds) await deleteSnapshot(rid);
  } catch {}
}

// 자동 저장 후 — 5분 이상 지났고 문서가 바뀌었으면 자동 시점을 남긴다.
async function _maybeAutoSnapshot(rec) {
  if (!shouldAutoSnapshot({ lastAt: _lastSnapAt, now: Date.now(), changed: true })) return;
  try {
    const existing = await idbListSnapshots(rec.id);
    const newest = existing.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    const curJson = JSON.stringify(rec.doc);
    if (newest && JSON.stringify(newest.doc) === curJson) { _lastSnapAt = Date.now(); return; } // 안 바뀜
    const snap = makeSnapshot({ projectId: rec.id, doc: rec.doc, thumb: rec.thumb ?? null, auto: true });
    await putSnapshot(snap);
    _lastSnapAt = snap.createdAt;
    await _pruneSnaps(rec.id);
  } catch {}
}

const projectApi = {
  getName: () => projectName,
  getId:   () => projectId,
  // 전환 후 새로고침. 테스트에서 바꿔 끼울 수 있게 주입형으로 둔다(location.reload 덮어쓰기는 일부 브라우저에서 막힘).
  reload: () => { if (typeof window !== 'undefined' && window.__noReload) return; location.reload(); },
  async newProject() {
    // 전환 전에 현재 프로젝트의 미저장 변경을 먼저 기록한다(썸네일은 생략).
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const id  = _genId();
    const doc = createDoc();
    await putProject({ id, name: '새 프로젝트', doc, updatedAt: Date.now() });
    _setCurrentId(id);
    projectApi.reload();
  },
  // 설치/전환 전 자동 저장 flush (업데이트 설치 전에도 호출).
  async flushSave() { if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} } },
  async exportFile() {
    try {
      const payload = await buildProjectFile(store.get());
      const json = JSON.stringify(payload);
      const blob = new Blob([json], { type: 'application/json' });
      // 웹: 다운로드 / 데스크톱: 저장 대화상자 (platform이 분기)
      await saveFile(`${projectName || '프로젝트'}.apngproj`, blob);
    } catch {
      showToast('내보내기에 실패했습니다.');
    }
  },
  // 파일(브라우저 File) 경로 — 웹 파일 입력/드롭에서 호출
  async importFile(file) {
    try { await _importFromText(await file.text(), file.name); }
    catch (err) { showToast('파일을 불러올 수 없습니다: ' + (err?.message ?? '형식 오류')); }
  },
  // 데스크톱 열기 대화상자
  async openProject() {
    try {
      const r = await openProjectFile();
      if (!r) return;
      const name = String(r.path ?? '').split(/[\\/]/).pop() || '불러온 프로젝트';
      await _importFromText(r.text, name);
    } catch (err) { showToast('파일을 불러올 수 없습니다: ' + (err?.message ?? '형식 오류')); }
  },

  // ── 프로젝트 목록(F5-2) ──────────────────────────────────────────────
  async listProjects() {
    try { return (await listProjects()).map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt ?? 0, thumb: p.thumb ?? null })); }
    catch { return []; }
  },
  async openProjectById(id) {
    if (id === projectId) return;
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const rec = await getProject(id);
    if (!rec) { showToast('프로젝트를 찾을 수 없습니다.'); return; }
    _setCurrentId(id);
    projectApi.reload();
  },
  // R23c 새 장면 — 크기·fps·길이·배경을 받아 새 프로젝트 생성·전환.
  async newScene({ width = 768, height = 768, fps = 12, frameCount = 24, background = null, name = '새 장면' } = {}) {
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const id  = _genId();
    const doc = createDoc({ width, height, fps, frameCount });
    if (background && background.type) doc.meta.background = background;
    await putProject({ id, name, doc, updatedAt: Date.now() });
    _setCurrentId(id);
    projectApi.reload();
  },
  // 새 프로젝트(템플릿·프리셋) — 전환+새로고침.
  async newProjectFromTemplate(templateKey = 'empty', presetKey = 'ccfolia-cutin') {
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const id = _genId();
    const doc = createProjectFromTemplate(templateKey, presetKey);
    await putProject({ id, name: '새 프로젝트', doc, updatedAt: Date.now() });
    _setCurrentId(id);
    projectApi.reload();
  },
  // 복제 — 독립 문서(깊은 복사), 전환하지 않음.
  async duplicateProject(id) {
    const rec = await getProject(id);
    if (!rec) return null;
    const nid = _genId();
    const doc = JSON.parse(JSON.stringify(rec.doc));
    await putProject({ id: nid, name: (rec.name || '프로젝트') + ' 복사', doc, updatedAt: Date.now(), thumb: rec.thumb ?? null });
    return nid;
  },
  async renameProject(id, name) {
    const rec = await getProject(id);
    if (!rec) return;
    await putProject({ ...rec, name, updatedAt: Date.now() });
    if (id === projectId) { projectName = name; shell?.setProjectName?.(name); } // 내보내기 파일 이름도 따라감(exportFile 이 projectName 사용)
  },
  // ── 저장 시점(R12-3) ─────────────────────────────────────────────────
  async listSnapshots(id = projectId) {
    try {
      const list = await idbListSnapshots(id);
      return list
        .map((s) => ({ id: s.id, createdAt: s.createdAt ?? 0, label: s.label ?? '', auto: !!s.auto, bytes: s.bytes ?? 0, thumb: s.thumb ?? null }))
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch { return []; }
  },
  // 지금 상태를 직접 시점으로 남긴다(이름 입력 가능). 직접 남긴 것은 자동으로 지우지 않는다.
  async createSnapshot(label = '') {
    if (!projectId) return;
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const doc = structuredClone(store.get());
    let thumb = null;
    try { thumb = await stage.renderThumbnail(256); } catch {}
    const snap = makeSnapshot({ projectId, doc, label, thumb, auto: false });
    await putSnapshot(snap);
    _lastSnapAt = snap.createdAt;
    await _pruneSnaps(projectId);
    return snap.id;
  },
  async deleteSnapshot(id) { try { await deleteSnapshot(id); } catch {} },
  // 이 시점으로 되돌리기 — 현재 상태를 먼저 시점으로 남긴 뒤 문서를 바꾼다(되돌린 것을 다시 되돌릴 수 있게).
  async revertToSnapshot(id) {
    const snap = await getSnapshot(id);
    if (!snap?.doc) { showToast('저장 시점을 찾을 수 없습니다.'); return false; }
    // 먼저 현재 상태를 자동 시점으로 보관.
    try {
      const curDoc = structuredClone(store.get());
      let thumb = null; try { thumb = await stage.renderThumbnail(256); } catch {}
      await putSnapshot(makeSnapshot({ projectId, doc: curDoc, label: '되돌리기 전', thumb, auto: true }));
      _lastSnapAt = Date.now();
    } catch {}
    // 문서 교체 = 되돌리기 기록 1건.
    let nextDoc;
    try { nextDoc = migrate(structuredClone(snap.doc)); } catch { nextDoc = structuredClone(snap.doc); }
    store.apply({ type: 'replaceDoc', doc: nextDoc });
    editorState.set({ selection: [], kfSelection: [], f: 0 });
    await _pruneSnaps(projectId);
    return true;
  },
  // 시점을 새 프로젝트로 연다(현재 프로젝트는 그대로).
  async openSnapshotAsNewProject(id) {
    const snap = await getSnapshot(id);
    if (!snap?.doc) { showToast('저장 시점을 찾을 수 없습니다.'); return; }
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const nid = _genId();
    let doc; try { doc = migrate(structuredClone(snap.doc)); } catch { doc = structuredClone(snap.doc); }
    await putProject({ id: nid, name: (projectName || '프로젝트') + ' (시점)', doc, updatedAt: Date.now(), thumb: snap.thumb ?? null });
    _setCurrentId(nid);
    projectApi.reload();
  },

  async deleteProject(id) {
    await idbDeleteProject(id);
    try { await deleteSnapshotsByProject(id); } catch {} // 프로젝트를 지우면 그 시점도 지운다(R12-3).
    // 여기서는 에셋을 정리하지 않는다 — 열려 있는 문서의 되돌리기로 살릴 수 있는 이미지나
    // 다른 탭/미저장 변경의 이미지를 지울 수 있다(R7-3). 정리는 앱 시작 때만 한다.
    if (id === projectId) {
      // 현재를 지웠으면 다른 프로젝트로, 없으면 새로.
      const rest = (await listProjects()).filter((p) => p.id !== id);
      if (rest.length) { _setCurrentId(rest.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0].id); }
      else { const nid = _genId(); await putProject({ id: nid, name: '새 프로젝트', doc: createDoc(), updatedAt: Date.now() }); _setCurrentId(nid); }
      projectApi.reload();
    }
  },
};

async function _importFromText(text, nameHint) {
  const payload = JSON.parse(text);
  const { doc } = await importProjectFile(payload);
  // 파싱·검증을 통과한 뒤에야 현재 프로젝트 변경을 기록하고 전환한다.
  if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
  const id   = _genId();
  const name = String(nameHint ?? '').replace(/\.apngproj$/i, '').replace(/\.json$/i, '') || '불러온 프로젝트';
  await putProject({ id, name, doc, updatedAt: Date.now() });
  _setCurrentId(id);
  projectApi.reload();
}

initTheme();
const shell = initShell(store, editorState, isDemo ? null : projectApi);
const { stage, playback, setSaveStatus } = shell;

// ── 자동 저장(데모 모드 제외) ──────────────────────────────────────────
if (!isDemo) {
  // 방금 연 상태를 바로 시점으로 남기지 않도록, 가장 최근 시점 시각으로 초기화(없으면 0 → 첫 변경에서 기준 시점).
  try { const snaps = await idbListSnapshots(projectId); if (snaps?.length) _lastSnapAt = Math.max(...snaps.map((s) => s.createdAt ?? 0)); } catch {}
  autosave = createAutosave({
    store,
    getProjectId:   () => projectId,
    getProjectName: () => projectName,
    saveRecord:     async (rec) => { await putProject(rec); await _maybeAutoSnapshot(rec); },
    renderThumbnail: () => stage.renderThumbnail(256),
    onStatus: (s) => setSaveStatus?.(s),
    onQuota:  () => showToast('브라우저 저장 공간이 부족합니다. 사용하지 않는 프로젝트를 정리하거나 이미지 크기를 줄여 보세요.'),
  });
  window.__autosave = autosave;
  window.__project  = projectApi;

  // R23d item 14: 탭 숨김/페이지 떠남에서 즉시 저장(썸네일 건너뜀) — DOM 감지는 core 밖(여기)에서.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave.flush({ withThumb: false });
  });
  window.addEventListener('pagehide', () => autosave.flush({ withThumb: false }));
}

// ── 오프라인 설치(PWA, F5-5) ──────────────────────────────────────────────
// 데스크톱 앱(Tauri)에서는 서비스 워커를 등록하지 않는다.
// 개발 서버(localhost/127.0.0.1)에서는 등록하지 않는다 — 서비스 워커가 옛 캐시를 먼저 보여줘
// "고쳤는데 그대로" 착각을 일으킨다(R7-2). 오프라인 테스트처럼 꼭 필요할 때만 ?sw=1 로 켠다.
const _swForced = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sw') === '1';
const _swLocal  = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
const _swEnabled = _swForced || !_swLocal;
if (!isDemo && !isDesktop() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !_swEnabled) {
  // 이미 등록된 것이 있으면 해제(개발 중 과거에 켰던 경우).
  navigator.serviceWorker.getRegistrations?.().then((regs) => { for (const r of regs) r.unregister(); }).catch(() => {});
}
if (!isDemo && !isDesktop() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && _swEnabled) {
  let _refreshed = false;
  let _updating  = false; // 사용자가 "새로고침"을 눌러 새 버전으로 교체 중일 때만 true
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // 새 버전(대기 중 워커)이 있으면 상단에 "새로고침하면 새 버전" 안내.
    function _offerUpdate(worker) {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) _showUpdateBar(worker);
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) _showUpdateBar(reg.waiting);
    reg.addEventListener('updatefound', () => _offerUpdate(reg.installing));
  }).catch(() => {});
  // controllerchange 는 (1) 최초 설치 시 claim, (2) 새 버전 교체 두 경우에 모두 발생한다.
  // 최초 설치(1)에서는 새로고침하면 안 된다. 사용자가 새 버전 적용을 요청(_updating)했을 때만 reload.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_refreshed || !_updating || (typeof window !== 'undefined' && window.__noReload)) return;
    _refreshed = true; location.reload();
  });
  function _showUpdateBar(worker) {
    if (document.querySelector('.pwa-update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'pwa-update-bar';
    bar.innerHTML = '<span>새 버전이 있습니다.</span>';
    const btn = document.createElement('button'); btn.className = 'accent sm'; btn.textContent = '새로고침';
    btn.addEventListener('click', () => { _updating = true; worker.postMessage({ type: 'skip-waiting' }); });
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }
}

// 테스트/디버그 전역
window.__store       = store;
window.__editorState = editorState;
window.__stage       = stage;
window.__playback    = playback;
window.__importPsd   = (file, opts) => import('./ui/psd-import.js').then((m) => m.importPsdFile(file, store, editorState, opts));
