// R23c 2-3 — 화면(캔버스) 바로 아래 한 줄: 배율 · 미리보기 해상도 · 투명 격자 · 가이드 · 안전 영역 · 격자 · 스냅 · 겹침.
//   배율·격자·가이드·안전 영역은 미리보기 전용(내보내기에 영향 없음). previewRes 는 작업 공간 저장값에만 둔다.
//   R23d item 6: 화면 위 "보기" 메뉴를 지우고 격자 간격·스냅·겹침(온니언) 조절을 여기로 옮겼다.
//   R23d item 11: 배율은 입력+목록 하나로 합치고(직접 입력 가능), 겹쳐 보이던 프레임 위치(1/24)는 재생 줄에만 둔다.
import { createDropdown } from '../controls/dropdown.js';

const RES_KEY = 'apng2.ws.previewRes';

function _loadRes() { try { const v = localStorage.getItem(RES_KEY); return ['full', 'half', 'quarter', 'auto'].includes(v) ? v : 'auto'; } catch { return 'auto'; } }
function _saveRes(v) { try { localStorage.setItem(RES_KEY, v); } catch {} }

// 배율 = 입력 칸 + 목록(프리셋). 직접 입력도 되고 목록에서도 고른다. 하나로 합친 것(R23d item 11).
function _createZoomCombo(editorState) {
  const wrap = document.createElement('div'); wrap.className = 'bb-group bb-zoom';
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'bb-zoom-input'; input.setAttribute('aria-label', '배율');
  const caret = document.createElement('button');
  caret.type = 'button'; caret.className = 'bb-zoom-caret'; caret.setAttribute('aria-label', '배율 목록');
  caret.innerHTML = '<span class="dropdown-caret" aria-hidden="true"></span>';
  wrap.append(input, caret);

  const PRESETS = [0.25, 0.5, 0.667, 1, 1.5, 2, 4, 8];
  const _fmt = (z) => Math.round(z * 100) + '%';
  const _setZoom = (z) => editorState.set({ zoom: Math.min(16, Math.max(0.1, z)), viewUserAdjusted: true });

  function _applyInput() {
    const pct = parseFloat(String(input.value).replace('%', '').trim());
    if (Number.isFinite(pct)) _setZoom(pct / 100); else sync();
  }
  input.addEventListener('change', _applyInput);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { _applyInput(); input.blur(); } });

  let list = null;
  function _closeList() { if (list) { list.remove(); list = null; document.removeEventListener('pointerdown', _onOut, true); } }
  function _onOut(e) { if (!wrap.contains(e.target) && (!list || !list.contains(e.target))) _closeList(); }
  function _openList() {
    _closeList();
    list = document.createElement('div'); list.className = 'dropdown-list';
    for (const z of PRESETS) {
      const o = document.createElement('div'); o.className = 'dropdown-option'; o.textContent = _fmt(z); o.dataset.value = String(z);
      o.addEventListener('click', () => { _setZoom(z); _closeList(); });
      list.appendChild(o);
    }
    document.body.appendChild(list);
    const r = wrap.getBoundingClientRect();
    list.style.left = r.left + 'px'; list.style.minWidth = r.width + 'px';
    const below = window.innerHeight - r.bottom;
    if (below < 180 && r.top > below) { list.style.bottom = (window.innerHeight - r.top) + 'px'; list.style.top = ''; }
    else { list.style.top = r.bottom + 'px'; list.style.bottom = ''; }
    setTimeout(() => document.addEventListener('pointerdown', _onOut, true), 0);
  }
  caret.addEventListener('click', (e) => { e.stopPropagation(); list ? _closeList() : _openList(); });

  function sync() { if (document.activeElement !== input) input.value = _fmt(editorState.get().zoom); }
  sync();
  return { el: wrap, sync, destroy: _closeList };
}

export function createBottombar(store, editorState) {
  const el = document.createElement('div');
  el.className = 'stage-bottombar';

  // ── 배율(입력+목록 하나) ──
  const zoom = _createZoomCombo(editorState);

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

  // ── 격자(그리드) + 간격 ── (옛 "보기" 메뉴에서 옮김)
  const gridWrap = document.createElement('div'); gridWrap.className = 'bb-group';
  const grid = _check('격자', 'grid');
  const gridStepDd = createDropdown({
    ariaLabel: '격자 간격',
    options: [8, 16, 32, 64, 128].map((v) => ({ value: String(v), label: `${v}px` })),
    value: String(editorState.get().gridStep ?? 32),
    onChange: (v) => editorState.set({ gridStep: parseInt(v, 10) }),
  });
  gridWrap.append(grid.w, gridStepDd.el);

  // ── 스냅 ──
  const snap = _check('스냅', 'snap');

  // ── 겹침(온니언): 켜짐 토글 + 앞/뒤 장수(켜졌을 때만 보임) ──
  const onionWrap = document.createElement('div'); onionWrap.className = 'bb-group';
  const onion = _check('겹침', 'onion');
  const onionBeforeDd = createDropdown({
    ariaLabel: '겹침 앞 장수',
    options: [0, 1, 2, 3].map((v) => ({ value: String(v), label: `앞${v}` })),
    value: String(editorState.get().onionBefore ?? 1),
    onChange: (v) => editorState.set({ onionBefore: parseInt(v, 10) }),
  });
  const onionAfterDd = createDropdown({
    ariaLabel: '겹침 뒤 장수',
    options: [0, 1, 2, 3].map((v) => ({ value: String(v), label: `뒤${v}` })),
    value: String(editorState.get().onionAfter ?? 1),
    onChange: (v) => editorState.set({ onionAfter: parseInt(v, 10) }),
  });
  onionWrap.append(onion.w, onionBeforeDd.el, onionAfterDd.el);
  function _syncOnion() {
    const on = !!editorState.get().onion;
    onionBeforeDd.el.style.display = on ? '' : 'none';
    onionAfterDd.el.style.display = on ? '' : 'none';
  }

  // 프레임 위치(1/24)는 재생 줄에만 둔다(R23d item 11) — 오른쪽 공간은 비워 둔다.
  const spacer = document.createElement('div'); spacer.className = 'bb-spacer';
  el.append(zoom.el, resWrap, checker.w, guides.w, safe.w, gridWrap, snap.w, onionWrap, spacer);

  _syncOnion();

  const unsubES = editorState.subscribe((p) => {
    if ('zoom' in p) zoom.sync();
    if ('checker' in p) checker.input.checked = !!editorState.get().checker;
    if ('guides' in p) guides.input.checked = !!editorState.get().guides;
    if ('safeArea' in p) safe.input.checked = !!editorState.get().safeArea;
    if ('grid' in p) grid.input.checked = !!editorState.get().grid;
    if ('gridStep' in p) gridStepDd.setValue?.(String(editorState.get().gridStep ?? 32));
    if ('snap' in p) snap.input.checked = !!editorState.get().snap;
    if ('onion' in p) { onion.input.checked = !!editorState.get().onion; _syncOnion(); }
    if ('onionBefore' in p) onionBeforeDd.setValue?.(String(editorState.get().onionBefore ?? 1));
    if ('onionAfter' in p) onionAfterDd.setValue?.(String(editorState.get().onionAfter ?? 1));
  });

  // 처음 값 반영(작업 공간 저장값 → previewRes). checker 기본 켜짐(투명 격자는 늘 보이던 기본).
  editorState.set({ previewRes: _loadRes() });

  function destroy() {
    unsubES(); zoom.destroy?.(); resDd.destroy?.(); gridStepDd.destroy?.(); onionBeforeDd.destroy?.(); onionAfterDd.destroy?.();
  }
  return { el, destroy };
}
