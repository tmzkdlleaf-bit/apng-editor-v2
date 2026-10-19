// 루프 검사 도구(F4-7) — Ctrl+Shift+L. 문서 전체 루프 이음새(checkLoopSeam) 결과 창.
// 문제 레이어 목록 + 차이. 클릭하면 그 레이어 선택. 움직이는 이미지 이음새는 "문서 길이 맞추기" 버튼 제공.
import { checkLoopSeam, animSeamFix } from '../core/anim/seam.js';
import motionRegistry from '../motions/registry.js';

const PROP_KO = { x: 'X', y: 'Y', scale: '크기', scaleX: '가로', scaleY: '세로', rotation: '회전', alpha: '투명도', zoom: '줌' };
const TEXT_KO = { reveal: '타자기', charAnim: '글자 애니' };

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
      const transformIssues = list.filter((i) => i.prop);
      const animIssue = list.find((i) => i.kind === 'anim');
      const textIssues = list.filter((i) => i.kind === 'text');

      const row = document.createElement('div');
      row.className = 'loopcheck-row';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      const nameSpan = document.createElement('span'); nameSpan.className = 'lc-name'; nameSpan.textContent = name;
      row.appendChild(nameSpan);

      const detail = document.createElement('span'); detail.className = 'lc-detail';

      if (transformIssues.length) {
        const props = transformIssues.map((i) => `${PROP_KO[i.prop] ?? i.prop} ${(Math.abs(i.atEnd - i.at0)).toFixed(1)}`).join(', ');
        const d = document.createElement('span'); d.className = 'lc-diff'; d.textContent = props;
        detail.appendChild(d);
      }
      for (const t of textIssues) {
        const d = document.createElement('span'); d.className = 'lc-diff';
        d.textContent = `${TEXT_KO[t.which] ?? '글자'}: 반복될 때 처음으로 돌아감`;
        detail.appendChild(d);
      }
      if (animIssue) {
        const d = document.createElement('span'); d.className = 'lc-diff';
        if (animIssue.mode === 'once') {
          d.textContent = `GIF(1회): 반복될 때 끝에서 처음으로 튐`;
        } else {
          d.textContent = `문서 ${(animIssue.docMs / 1000).toFixed(2)}초가 GIF ${(animIssue.gifMs / 1000).toFixed(2)}초의 배수가 아님`;
        }
        detail.appendChild(d);
        // "문서 길이를 GIF에 맞추기" 버튼(한 바퀴 이상인 loop 에서만 의미 있음)
        const fix = animSeamFix(store.get(), layerId);
        if (fix && animIssue.mode !== 'once') {
          const fixBtn = document.createElement('button');
          fixBtn.className = 'lc-fix accent sm';
          fixBtn.textContent = '문서 길이를 GIF에 맞추기';
          let hint = `→ ${(fix.targetDocMs / 1000).toFixed(2)}초`;
          if (fix.residualMs >= 0.5) hint += ` (오차 약 ${Math.round(fix.residualMs)}ms`;
          if (fix.suggestedFps) hint += `${fix.residualMs >= 0.5 ? ', ' : ' ('}fps ${fix.suggestedFps}로 바꾸면 딱 맞음`;
          if (fix.residualMs >= 0.5 || fix.suggestedFps) hint += ')';
          const hintSpan = document.createElement('span'); hintSpan.className = 'lc-fix-hint'; hintSpan.textContent = hint;
          fixBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            store.apply({ type: 'setMeta', patch: { frameCount: fix.frameCount } });
            closeLoopCheck();
          });
          detail.append(fixBtn, hintSpan);
        }
      }
      row.appendChild(detail);

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
