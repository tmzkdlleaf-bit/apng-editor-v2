// R23b — 오른쪽 "정보" 탭. 마우스 위치 문서 좌표·그 위치 색(지금 화면에 그려진 결과)·선택 레이어 숫자.
//   좌표 변환은 화면(stage)의 screenToDoc 를 그대로 쓴다(줌·이동·카메라가 섞여도 맞게).
//   마우스가 화면 밖이면 좌표·색은 "–". 매 이동마다 다시 그리지 않고 한 프레임에 한 번(rAF)으로 묶는다.
import { getDocWorldTr, getLayerBounds } from '../canvas/hit.js';

const DASH = '–';

export function createInfoPanel(store, editorState, getDeps = () => ({})) {
  const el = document.createElement('div');
  el.className = 'side-panel info-panel';

  const mkRow = (label) => {
    const row = document.createElement('div'); row.className = 'info-row';
    const l = document.createElement('span'); l.className = 'info-label'; l.textContent = label;
    const v = document.createElement('span'); v.className = 'info-value';
    row.append(l, v); el.appendChild(row); return v;
  };

  const posV = mkRow('마우스 X · Y');
  const colV = mkRow('색 (rgba)'); const colSw = document.createElement('span'); colSw.className = 'info-swatch'; colV.appendChild(colSw);
  const colText = document.createElement('span'); colText.className = 'info-color-text'; colV.appendChild(colText);
  const sep = document.createElement('div'); sep.className = 'adj-subtitle'; sep.textContent = '선택'; el.appendChild(sep);
  const selPosV = mkRow('위치 X · Y');
  const selSizeV = mkRow('크기 (px)');
  const selRotV = mkRow('회전');
  const selOpaV = mkRow('투명도');

  // 마우스 좌표용 span 2개
  const mx = document.createElement('span'); mx.className = 'info-mx'; const my = document.createElement('span'); my.className = 'info-my';
  posV.append(mx, document.createTextNode('  ·  '), my);

  let _ev = null;       // 마지막 마우스 이벤트(화면 안일 때)
  let _in = false;
  let _raf = 0;

  function _schedule() { if (!_raf) _raf = requestAnimationFrame(_tick); }

  function _onMove(e) {
    const deps = getDeps() || {};
    const cv = deps.overlay;
    if (!cv) { _in = false; _ev = null; _schedule(); return; }
    const r = cv.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    _in = inside; _ev = inside ? { x: e.clientX - r.left, y: e.clientY - r.top, rect: r } : null;
    _schedule();
  }
  function _onLeave() { _in = false; _ev = null; _schedule(); }

  function _tick() {
    _raf = 0;
    _updateMouse();
    _updateSelection();
  }

  function _updateMouse() {
    const deps = getDeps() || {};
    if (!_in || !_ev || !deps.screenToDoc) { mx.textContent = DASH; my.textContent = DASH; colText.textContent = DASH; colSw.style.background = 'transparent'; return; }
    const d = deps.screenToDoc(_ev.x, _ev.y);
    mx.textContent = String(Math.round(d.x)); my.textContent = String(Math.round(d.y));
    // 색 — 지금 화면에 그려진 장면(scene) 픽셀에서 읽는다(device px).
    const scene = deps.scene;
    if (scene) {
      const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      const px = Math.round(_ev.x * dpr), py = Math.round(_ev.y * dpr);
      if (px >= 0 && py >= 0 && px < scene.width && py < scene.height) {
        try {
          const data = scene.getContext('2d').getImageData(px, py, 1, 1).data;
          const [cr, cg, cb, ca] = data;
          colText.textContent = `${cr}, ${cg}, ${cb}, ${(ca / 255).toFixed(2)}`;
          colSw.style.background = `rgba(${cr},${cg},${cb},${ca / 255})`;
        } catch { colText.textContent = DASH; colSw.style.background = 'transparent'; }
      }
    }
  }

  function _updateSelection() {
    const ids = editorState.get().selection;
    const doc = store.get();
    const f = editorState.get().f;
    const deps = getDeps() || {};
    const assets = deps.assets;
    if (!ids.length) { selPosV.textContent = DASH; selSizeV.textContent = DASH; selRotV.textContent = DASH; selOpaV.textContent = DASH; return; }

    if (ids.length === 1) {
      const layer = doc.layers[ids[0]];
      const tr = layer && getDocWorldTr(doc, ids[0], f, { camera: false });
      if (!tr) { selPosV.textContent = DASH; selSizeV.textContent = DASH; selRotV.textContent = DASH; selOpaV.textContent = DASH; return; }
      selPosV.textContent = `${Math.round(tr.x)} · ${Math.round(tr.y)}`;
      const b = getLayerBounds(layer, assets);
      if (b) {
        const sc = (tr.scale ?? 1);
        const w = b.hw * 2 * sc * (tr.scaleX ?? 1);
        const h = b.hh * 2 * sc * (tr.scaleY ?? 1);
        selSizeV.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      } else selSizeV.textContent = DASH;
      selRotV.textContent = `${Math.round(tr.rotation ?? 0)}°`;
      selOpaV.textContent = `${Math.round((tr.alpha ?? 1) * 100)}%`;
    } else {
      // 여러 개 — 묶음 상자(문서 좌표) 기준.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of ids) {
        const layer = doc.layers[id]; if (!layer) continue;
        const tr = getDocWorldTr(doc, id, f, { camera: false });
        const b = getLayerBounds(layer, assets);
        if (!tr || !b) continue;
        const { hw, hh, ox = 0, oy = 0 } = b;
        const rad = (tr.rotation ?? 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const sx = (tr.scale ?? 1) * (tr.scaleX ?? 1), sy = (tr.scale ?? 1) * (tr.scaleY ?? 1);
        for (const [lx, ly] of [[ox - hw, oy - hh], [ox + hw, oy - hh], [ox + hw, oy + hh], [ox - hw, oy + hh]]) {
          const wx = tr.x + (lx * sx) * cos - (ly * sy) * sin;
          const wy = tr.y + (lx * sx) * sin + (ly * sy) * cos;
          if (wx < minX) minX = wx; if (wy < minY) minY = wy; if (wx > maxX) maxX = wx; if (wy > maxY) maxY = wy;
        }
      }
      if (minX < Infinity) {
        selPosV.textContent = `${Math.round(minX)} · ${Math.round(minY)}`;
        selSizeV.textContent = `${Math.round(maxX - minX)} × ${Math.round(maxY - minY)}`;
      } else { selPosV.textContent = DASH; selSizeV.textContent = DASH; }
      selRotV.textContent = DASH; selOpaV.textContent = DASH;
    }
  }

  // 마우스는 문서(document) 단위로 듣되 화면 안/밖을 rect 로 판별한다.
  document.addEventListener('pointermove', _onMove);
  document.addEventListener('pointerleave', _onLeave);
  const unsubES = editorState.subscribe((p) => { if ('selection' in p || 'f' in p) _schedule(); });
  const unsubStore = store.subscribe({ any: true }, () => _schedule());
  _tick();

  function destroy() {
    document.removeEventListener('pointermove', _onMove);
    document.removeEventListener('pointerleave', _onLeave);
    unsubES(); unsubStore();
    if (_raf) cancelAnimationFrame(_raf);
  }
  return { el, destroy };
}
