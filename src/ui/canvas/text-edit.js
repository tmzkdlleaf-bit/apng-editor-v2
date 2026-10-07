// 캔버스에서 글자 레이어 더블클릭 → 바로 편집(캔버스 위 입력 칸).
// Esc 취소, 바깥 클릭/blur 확정, 기록 1건. 편집 중에는 해당 레이어를 숨겨 겹쳐 보이지 않게 한다.
import { hitTest } from './hit.js';
import { screenToDoc, docToScreen } from './transform.js';

export function initTextEdit(overlayCanvas, containerEl, store, editorState, assets) {
  let _editing = null; // { id, ta, prevText, outsideHandler }

  function _cssSize() { const r = overlayCanvas.getBoundingClientRect(); return { W: r.width, H: r.height }; }

  overlayCanvas.addEventListener('dblclick', (e) => {
    if (_editing) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const { W, H } = _cssSize();
    const es = editorState.get(); const doc = store.get();
    const d = screenToDoc(e.clientX - rect.left, e.clientY - rect.top, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
    const id = hitTest(doc, d.x, d.y, es.f, null, assets);
    if (!id || doc.layers[id]?.type !== 'text') return;
    e.preventDefault();
    _begin(id);
  });

  function _begin(id) {
    const doc = store.get();
    const layer = doc.layers[id];
    const es = editorState.get();
    const { W, H } = _cssSize();
    // 레이어 기준점(앵커)의 화면 위치
    const sx = layer.transform?.x?.value ?? 0;
    const sy = layer.transform?.y?.value ?? 0;
    const p = docToScreen(sx, sy, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);

    const ta = document.createElement('textarea');
    ta.className = 'canvas-text-edit';
    ta.value = layer.text ?? '';
    const fontPx = Math.max(8, (layer.size ?? 48) * es.zoom);
    ta.style.left = p.x + 'px';
    ta.style.top  = p.y + 'px';
    ta.style.font = `${layer.weight ?? 400} ${fontPx}px ${layer.font ?? 'sans-serif'}`;
    ta.style.color = layer.color ?? '#fff';
    ta.style.textAlign = layer.align ?? 'center';
    containerEl.appendChild(ta);
    ta.focus(); ta.select();

    store.begin('글자 편집');

    const onInput = () => store.preview({ type: 'setLayer', id, patch: { text: ta.value } });
    const finish = (apply) => {
      ta.removeEventListener('input', onInput);
      document.removeEventListener('pointerdown', onOutside, true);
      ta.remove();
      if (apply) {
        store.preview({ type: 'setLayer', id, patch: { text: ta.value } });
        store.commit();   // 되돌리기 1건
      } else {
        store.cancel();
      }
      _editing = null;
    };
    const onOutside = (ev) => { if (ev.target !== ta) finish(true); };

    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      // Enter 는 줄바꿈 허용. 확정은 바깥 클릭/blur.
    });
    // 바깥 클릭(캔버스 포함) 확정
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

    _editing = { id, ta, finish };
  }

  function destroy() { if (_editing) _editing.finish(false); }
  return { destroy, isEditing: () => !!_editing };
}
