// R23c 2-3 — 화면(캔버스) 바로 아래 한 줄: 배율 · 미리보기 해상도 · 투명 격자 · 가이드 · 안전 영역 · 프레임.
//   배율·격자·가이드·안전 영역은 미리보기 전용(내보내기에 영향 없음). previewRes 는 작업 공간 저장값에만 둔다.
import { createDropdown } from '../controls/dropdown.js';

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8];
const RES_KEY = 'apng2.ws.previewRes';

function _loadRes() { try { const v = localStorage.getItem(RES_KEY); return ['full', 'half', 'quarter', 'auto'].includes(v) ? v : 'auto'; } catch { return 'auto'; } }
function _saveRes(v) { try { localStorage.setItem(RES_KEY, v); } catch {} }

export function createBottombar(store, editorState) {
  const el = document.createElement('div');
  el.className = 'stage-bottombar';

  // ── 배율 ──
  const zoomWrap = document.createElement('div'); zoomWrap.className = 'bb-group';
  const zoomDd = createDropdown({
    ariaLabel: '배율',
    options: ZOOM_STEPS.map((z) => ({ value: String(z), label: Math.round(z * 100) + '%' })),
    value: '1',
    onChange: (v) => editorState.set({ zoom: parseFloat(v) }),
  });
  const zoomNum = document.createElement('input');
  zoomNum.type = 'number'; zoomNum.className = 'num-input bb-zoom-num'; zoomNum.min = '10'; zoomNum.max = '1600'; zoomNum.step = '5';
  zoomNum.setAttribute('aria-label', '배율 %');
  zoomNum.addEventListener('change', () => {
    const pct = parseFloat(zoomNum.value);
    if (Number.isFinite(pct)) editorState.set({ zoom: Math.min(16, Math.max(0.1, pct / 100)) });
  });
  const zoomPct = document.createElement('span'); zoomPct.className = 'bb-unit'; zoomPct.textContent = '%';
  zoomWrap.append(zoomDd.el, zoomNum, zoomPct);

  // ── 미리보기 해상도 ──
  const resWrap = document.createElement('div'); resWrap.className = 'bb-group';
  const resLabel = document.createElement('span'); resLabel.className = 'bb-label'; resLabel.textContent = '해상도';
  const resDd = createDropdown({
    ariaLabel: '미리보기 해상도',
    options: [{ value: 'full', label: '전체' }, { value: 'half', label: '1/2' }, { value: 'quarter', label: '1/4' }, { value: 'auto', label: '자동' }],
    value: _loadRes(),
    onChange: (v) => { _saveRes(v); editorState.set({ previewRes: v }); },
  });
  resWrap.append(resLabel, resDd.el);

  // ── 체크박스들: 투명 격자 · 가이드 · 안전 영역 ──
  function _check(label, key) {
    const w = document.createElement('label'); w.className = 'bb-check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!editorState.get()[key];
    input.addEventListener('change', () => editorState.set({ [key]: input.checked }));
    const span = document.createElement('span'); span.textContent = label;
    w.append(input, span);
    return { w, input };
  }
  const checker = _check('투명 격자', 'checker');
  const guides  = _check('가이드', 'guides');
  const safe    = _check('안전 영역', 'safeArea');

  // ── 프레임 ──
  const frameWrap = document.createElement('div'); frameWrap.className = 'bb-group bb-frame';
  const frameText = document.createElement('span'); frameText.className = 'bb-frame-text';
  frameWrap.appendChild(frameText);

  const spacer = document.createElement('div'); spacer.className = 'bb-spacer';
  el.append(zoomWrap, resWrap, checker.w, guides.w, safe.w, spacer, frameWrap);

  function _syncZoom() {
    const z = editorState.get().zoom;
    zoomNum.value = String(Math.round(z * 100));
    // 가장 가까운 스텝으로 드롭다운 표시(없으면 그대로 둠).
    const near = ZOOM_STEPS.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, ZOOM_STEPS[0]);
    if (Math.abs(near - z) < 0.001) zoomDd.setValue?.(String(near));
  }
  function _syncFrame() {
    const f = editorState.get().f; const fc = store.get().meta.frameCount ?? 1;
    frameText.textContent = `${f + 1} / ${fc}`;
  }
  _syncZoom(); _syncFrame();

  const unsubES = editorState.subscribe((p) => {
    if ('zoom' in p) _syncZoom();
    if ('f' in p) _syncFrame();
    if ('checker' in p) checker.input.checked = !!editorState.get().checker;
    if ('guides' in p) guides.input.checked = !!editorState.get().guides;
    if ('safeArea' in p) safe.input.checked = !!editorState.get().safeArea;
  });
  const unsubStore = store.subscribe({ meta: true }, _syncFrame);

  // 처음 값 반영(작업 공간 저장값 → previewRes). checker 기본 켜짐(투명 격자는 늘 보이던 기본).
  editorState.set({ previewRes: _loadRes() });

  function destroy() { unsubES(); unsubStore(); zoomDd.destroy?.(); resDd.destroy?.(); }
  return { el, destroy };
}
