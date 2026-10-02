import { init as initTheme } from './ui/shell/theme.js';
import { init as initShell } from './ui/shell/shell.js';
import { createStore } from './core/doc/store.js';
import { createDoc } from './core/doc/schema.js';
import { createEditorState } from './ui/editor-state.js';

const isDemo = new URLSearchParams(location.search).get('demo') === '1';

let initialDoc;
if (isDemo) {
  // demo.js는 동적 import로 — 일반 모드에서 불필요한 코드 제외
  const { createDemoDoc } = await import('./ui/demo.js');
  initialDoc = createDemoDoc();
} else {
  initialDoc = createDoc();
}

const store = createStore(initialDoc);
const editorState = createEditorState();

initTheme();
const stage = initShell(store, editorState);

if (isDemo) {
  window.__store = store;
  window.__editorState = editorState;
  window.__stage = stage;
}
