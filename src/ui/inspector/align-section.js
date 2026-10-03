// 인스펙터 정렬 섹션 — 6방향 (왼·가운데·오른 / 위·가운데·아래)
// 하나면 캔버스 기준, 여러 개면 선택 영역 기준. 기록 1건.
import { makeSectionShell } from './section-shell.js';
import { getDocWorldTr, getLayerBounds } from '../canvas/hit.js';
import { buildPropCmd } from '../canvas/edit-prop.js';

// 회전 무시한 doc 공간 축 정렬 bbox 와 anchor 오프셋 정보
function _layerBox(doc, id, f) {
  const layer = doc.layers[id];
  if (!layer) return null;
  const tr = getDocWorldTr(doc, id, f);
  const b  = getLayerBounds(layer);
  if (!tr || !b) return null;
  const s = tr.scale ?? 1;
  const cx = tr.x + (b.ox ?? 0) * s;   // bbox 중심 (doc)
  const cy = tr.y + (b.oy ?? 0) * s;
  const hw = b.hw * s, hh = b.hh * s;
  return { tr, s, cx, cy, hw, hh, ox: b.ox ?? 0, oy: b.oy ?? 0 };
}

export function createAlignSection(store, editorState) {
  const { section, body } = makeSectionShell('정렬', false);

  const dirs = [
    ['left',   '왼쪽',   'h'], ['hcenter', '가운데', 'h'], ['right',  '오른쪽', 'h'],
    ['top',    '위',     'v'], ['vcenter', '가운데', 'v'], ['bottom', '아래',   'v'],
  ];

  const rowH = document.createElement('div'); rowH.className = 'align-row';
  const rowV = document.createElement('div'); rowV.className = 'align-row';
  for (const [key, label, axis] of dirs) {
    const btn = document.createElement('button');
    btn.className = 'align-btn';
    btn.dataset.align = key;
    btn.textContent = label;
    btn.title = (axis === 'h' ? '가로 ' : '세로 ') + label;
    btn.addEventListener('click', () => _align(key));
    (axis === 'h' ? rowH : rowV).appendChild(btn);
  }
  body.append(rowH, rowV);

  function _align(key) {
    const es  = editorState.get();
    const doc = store.get();
    const ids = es.selection.filter(id => doc.layers[id] && !doc.layers[id].locked);
    if (!ids.length) return;
    const f = es.f;

    const boxes = ids.map(id => ({ id, box: _layerBox(doc, id, f) })).filter(x => x.box);
    if (!boxes.length) return;

    // 기준 영역
    let refL, refR, refT, refB;
    if (ids.length === 1) {
      refL = 0; refT = 0; refR = doc.meta.width; refB = doc.meta.height;
    } else {
      refL =  Infinity; refT =  Infinity; refR = -Infinity; refB = -Infinity;
      for (const { box } of boxes) {
        refL = Math.min(refL, box.cx - box.hw);
        refR = Math.max(refR, box.cx + box.hw);
        refT = Math.min(refT, box.cy - box.hh);
        refB = Math.max(refB, box.cy + box.hh);
      }
    }

    const cmds = [];
    for (const { id, box } of boxes) {
      let targetCx = box.cx, targetCy = box.cy;
      switch (key) {
        case 'left':    targetCx = refL + box.hw; break;
        case 'hcenter': targetCx = (refL + refR) / 2; break;
        case 'right':   targetCx = refR - box.hw; break;
        case 'top':     targetCy = refT + box.hh; break;
        case 'vcenter': targetCy = (refT + refB) / 2; break;
        case 'bottom':  targetCy = refB - box.hh; break;
      }
      // 중심 → anchor 좌표 역산 (회전 무시): anchorX = cx - ox*s
      const newX = targetCx - box.ox * box.s;
      const newY = targetCy - box.oy * box.s;
      if (key === 'left' || key === 'hcenter' || key === 'right') {
        cmds.push(buildPropCmd(doc, id, 'transform.x', newX, f, es.autoKey));
      } else {
        cmds.push(buildPropCmd(doc, id, 'transform.y', newY, f, es.autoKey));
      }
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  return { el: section, destroy() {} };
}
