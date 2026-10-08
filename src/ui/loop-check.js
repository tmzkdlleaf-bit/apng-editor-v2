// 루프 검사 도구(F4-7) — Ctrl+Shift+L. 문서 전체 루프 이음새(checkLoopSeam) 결과 창.
// 문제 레이어 목록 + 차이 크기, 클릭하면 그 레이어 선택. 내보내기 경고와 같은 결과.
import { checkLoopSeam } from '../core/anim/seam.js';
import motionRegistry from '../motions/registry.js';

const PROP_KO = { x: 'X', y: 'Y', scale: '크기', rotation: '회전', alpha: '투명도', zoom: '줌' };

let _open = null;

export function openLoopCheck(store, editorState) {
  closeLoopCheck();
  const doc = store.get();
  const issues = checkLoopSeam(doc, motionRegistry);

  // 레이어별로 묶기
  const byLayer = new Map();
  for (const it of issues) {
    if (!byLayer.has(it.layerId)) byLayer.set(it.layerId, []);
    byLayer.get(it.layerId).push(it);
  }

  const modal = document.createElement('div');
  modal.className = 'loopcheck-modal';
  const panel = document.createElement('div');
  panel.className = 'loopcheck-panel';
  modal.appendChild(panel);

  const head = document.createElement('div'); head.className = 'loopcheck-head';
  head.innerHTML = `<span>루프 이음새 검사</span>`;
  const closeBtn = document.createElement('button'); closeBtn.className = 'loopcheck-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeLoopCheck);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const bodyEl = document.createElement('div'); bodyEl.className = 'loopcheck-body';
  if (!issues.length) {
    bodyEl.innerHTML = `<div class="loopcheck-ok">이음새 문제가 없습니다. 모든 레이어가 매끄럽게 반복됩니다.</div>`;
  } else {
    for (const [layerId, list] of byLayer) {
      const name = layerId === '__camera__' ? '카메라' : (doc.layers[layerId]?.name || doc.layers[layerId]?.type || layerId);
      const row = document.createElement('button');
      row.className = 'loopcheck-row';
      const maxDiff = Math.max(...list.map((i) => Math.abs(i.atEnd - i.at0)));
      const props = list.map((i) => `${PROP_KO[i.prop] ?? i.prop} ${(Math.abs(i.atEnd - i.at0)).toFixed(1)}`).join(', ');
      row.innerHTML = `<span class="lc-name">${name}</span><span class="lc-diff">${props}</span>`;
      row.title = `차이 최대 ${maxDiff.toFixed(2)}`;
      row.addEventListener('click', () => {
        if (layerId === '__camera__') editorState.set({ cameraActive: true, selection: [] });
        else editorState.set({ selection: [layerId], cameraActive: false });
        closeLoopCheck();
      });
      bodyEl.appendChild(row);
    }
  }
  panel.appendChild(bodyEl);

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeLoopCheck(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _open = modal;
  return { close: closeLoopCheck, issueCount: issues.length };
}

function _onKey(e) { if (e.key === 'Escape') closeLoopCheck(); }
export function closeLoopCheck() {
  if (_open) { _open.remove(); _open = null; document.removeEventListener('keydown', _onKey, true); }
}
