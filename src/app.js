import { init as initTheme } from './ui/shell/theme.js';
import { init as initShell } from './ui/shell/shell.js';
import { createStore } from './core/doc/store.js';
import { createDoc } from './core/doc/schema.js';
import { createEditorState } from './ui/editor-state.js';
import { getProject, putProject } from './core/io/idb.js';
import { purgeOrphanAssets } from './core/io/assets.js';
import { migrate } from './core/io/migrate.js';
import { buildProjectFile, importProjectFile } from './core/io/project-file.js';
import { createAutosave } from './core/io/autosave.js';
import { showToast } from './ui/shell/status.js';

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
  async newProject() {
    // 전환 전에 현재 프로젝트의 미저장 변경을 먼저 기록한다(썸네일은 생략).
    if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
    const id  = _genId();
    const doc = createDoc();
    await putProject({ id, name: '새 프로젝트', doc, updatedAt: Date.now() });
    _setCurrentId(id);
    location.reload();
  },
  async exportFile() {
    try {
      const payload = await buildProjectFile(store.get());
      const json = JSON.stringify(payload);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `${projectName || '프로젝트'}.apngproj`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast('내보내기에 실패했습니다.');
    }
  },
  async importFile(file) {
    try {
      const payload = JSON.parse(await file.text());
      const { doc } = await importProjectFile(payload);
      // 파싱·검증을 통과한 뒤에야 현재 프로젝트 변경을 기록하고 전환한다.
      if (autosave) { try { await autosave.flush({ withThumb: false }); } catch {} }
      const id   = _genId();
      const name = file.name.replace(/\.apngproj$/i, '').replace(/\.json$/i, '') || '불러온 프로젝트';
      await putProject({ id, name, doc, updatedAt: Date.now() });
      _setCurrentId(id);
      location.reload();
    } catch (err) {
      showToast('파일을 불러올 수 없습니다: ' + (err?.message ?? '형식 오류'));
    }
  },
};

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

// 테스트/디버그 전역
window.__store       = store;
window.__editorState = editorState;
window.__stage       = stage;
window.__playback    = playback;
