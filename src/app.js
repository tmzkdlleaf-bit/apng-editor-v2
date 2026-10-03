import { init as initTheme } from './ui/shell/theme.js';
import { init as initShell } from './ui/shell/shell.js';
import { createStore } from './core/doc/store.js';
import { createDoc } from './core/doc/schema.js';
import { createEditorState } from './ui/editor-state.js';

const demoParam = new URLSearchParams(location.search).get('demo');
const isDemo    = demoParam === '1' || demoParam === 'simple';

let initialDoc;
if (demoParam === '1') {
  const { createLargeDemo } = await import('./ui/demo.js');
  initialDoc = createLargeDemo();
} else if (demoParam === 'simple') {
  const { createDemoDoc } = await import('./ui/demo.js');
  initialDoc = createDemoDoc();
} else {
  initialDoc = createDoc();
}

const store       = createStore(initialDoc);
const editorState = createEditorState();

initTheme();
const { stage, playback } = initShell(store, editorState);

if (isDemo) {
  window.__store       = store;
  window.__editorState = editorState;
  window.__stage       = stage;
  window.__playback    = playback;
}
