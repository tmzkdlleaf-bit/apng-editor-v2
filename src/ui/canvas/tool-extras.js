// R23c 2-2 — 새 도구의 캔버스 동작: 확대(zoom)·글자(text)·도형(shape).
//   확대: 누른 곳 기준 확대(Alt+클릭 축소). 글자·도형: 누른 자리에 레이어를 만든다.
//   select/hand/edit/mask/pen/motion 등 기존 도구는 각자 핸들러(drag·view·mask-edit…)가 처리하므로 건드리지 않는다.
import { screenToDoc } from './transform.js';
import { createLayer } from '../../core/doc/schema.js';

const ZOOM_MIN = 0.1, ZOOM_MAX = 16;
const ZOOM_STEPS = [0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
function _nextStep(z, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? ZOOM_STEPS[0];
}
function _clamp(z) { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)); }

export function initToolExtras(overlayCanvas, store, editorState) {
  function _cssSize() { const r = overlayCanvas.getBoundingClientRect(); return { W: r.width, H: r.height, r }; }

  function _zoomAt(cx, cy, dir) {
    const es = editorState.get(), doc = store.get();
    const { W, H } = _cssSize();
    const { width: docW, height: docH } = doc.meta;
    const oldZoom = es.zoom;
    const clamped = _clamp(_nextStep(oldZoom, dir));
    // 커서 위치(화면)를 유지하도록 pan 보정 — view.js _setZoom 과 같은 식.
    const ox = W / 2 - docW * oldZoom / 2 + es.panX;
    const oy = H / 2 - docH * oldZoom / 2 + es.panY;
    const docPX = (cx - ox) / oldZoom, docPY = (cy - oy) / oldZoom;
    const newOx = cx - docPX * clamped, newOy = cy - docPY * clamped;
    editorState.set({
      zoom: clamped,
      panX: newOx - (W / 2 - docW * clamped / 2),
      panY: newOy - (H / 2 - docH * clamped / 2),
    });
  }

  function _docAt(cx, cy) {
    const es = editorState.get(), doc = store.get();
    const { W, H } = _cssSize();
    return screenToDoc(cx, cy, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }

  function _createAt(type, d) {
    const doc = store.get();
    const layer = createLayer(type, { name: type === 'text' ? '글자' : '도형' });
    layer.transform.x.value = Math.round(d.x);
    layer.transform.y.value = Math.round(d.y);
    if (type === 'text') { layer.text = '텍스트'; layer.size = 48; layer.color = '#ffffff'; }
    else { layer.shape = { kind: 'rect', w: 120, h: 120, fill: '#ffffff', stroke: null }; }
    store.apply({ type: 'addLayer', layer, index: doc.order.length });
    // 만든 뒤에는 옮기기 도구로 돌아가 바로 조정할 수 있게 한다.
    editorState.set({ selection: [layer.id], tool: 'select' });
  }

  function _onDown(e) {
    if (e.button !== 0) return;
    const tool = editorState.get().tool;
    if (tool !== 'zoom' && tool !== 'text' && tool !== 'shape') return;
    const { r } = _cssSize();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    e.preventDefault();
    // 다른 핸들러(drag 등)가 같은 pointerdown 을 처리하지 않게 막는다.
    e.stopImmediatePropagation();
    if (tool === 'zoom') { _zoomAt(cx, cy, e.altKey ? -1 : 1); return; }
    _createAt(tool, _docAt(cx, cy));
  }

  // 캡처 단계에서 먼저 받아 drag.js 보다 앞서 처리한다.
  overlayCanvas.addEventListener('pointerdown', _onDown, true);

  function _updateCursor() {
    const tool = editorState.get().tool;
    if (tool === 'zoom') overlayCanvas.style.cursor = 'zoom-in';
    else if (tool === 'text' || tool === 'shape') overlayCanvas.style.cursor = 'crosshair';
  }
  const unsub = editorState.subscribe((p) => { if ('tool' in p) _updateCursor(); });
  _updateCursor();

  return { destroy() { overlayCanvas.removeEventListener('pointerdown', _onDown, true); unsub(); } };
}
