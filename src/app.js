import { init as initTheme } from './ui/shell/theme.js';
import { init as initShell } from './ui/shell/shell.js';
import { createStore } from './core/doc/store.js';
import { createDoc } from './core/doc/schema.js';
import { createEditorState } from './ui/editor-state.js';
import { getProject, putProject, listProjects, deleteProject as idbDeleteProject } from './core/io/idb.js';
import { purgeOrphanAssets } from './core/io/assets.js';
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
  try { await purgeOrphanAssets(); } catch {}
}

const store       = createStore(initialDoc);
const editorState = createEditorState();

// ── 프로젝트 조작(메뉴에서 호출) — 전환은 새 id 저장 후 새로고침 ───────────
let autosave = null;

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
  async deleteProject(id) {
    await idbDeleteProject(id);
    try { await purgeOrphanAssets(); } catch {}
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
  autosave = createAutosave({
    store,
    getProjectId:   () => projectId,
    getProjectName: () => projectName,
    saveRecord:     (rec) => putProject(rec),
    renderThumbnail: () => stage.renderThumbnail(256),
    onStatus: (s) => setSaveStatus?.(s),
    onQuota:  () => showToast('브라우저 저장 공간이 부족합니다. 사용하지 않는 프로젝트를 정리하거나 이미지 크기를 줄여 보세요.'),
  });
  window.__autosave = autosave;
  window.__project  = projectApi;
}

// ── 오프라인 설치(PWA, F5-5) ──────────────────────────────────────────────
// 데스크톱 앱(Tauri)에서는 서비스 워커를 등록하지 않는다.
if (!isDemo && !isDesktop() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  let _refreshed = false;
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_refreshed || (typeof window !== 'undefined' && window.__noReload)) return;
    _refreshed = true; location.reload();
  });
  function _showUpdateBar(worker) {
    if (document.querySelector('.pwa-update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'pwa-update-bar';
    bar.innerHTML = '<span>새 버전이 있습니다.</span>';
    const btn = document.createElement('button'); btn.className = 'accent sm'; btn.textContent = '새로고침';
    btn.addEventListener('click', () => { worker.postMessage({ type: 'skip-waiting' }); });
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }
}

// 테스트/디버그 전역
window.__store       = store;
window.__editorState = editorState;
window.__stage       = stage;
window.__playback    = playback;
