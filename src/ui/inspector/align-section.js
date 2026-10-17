// 인스펙터 정렬 섹션 — 6방향 (왼·가운데·오른 / 위·가운데·아래)
// 하나면 캔버스 기준, 여러 개면 선택 영역 기준. 기록 1건.
// 기본은 "보이는 화면(카메라 적용 후)" 기준 — 끌기·스냅과 같은 기준. "카메라 무시"를 켜면
// 카메라를 뺀 원래 문서 좌표 기준(카메라를 움직여도 레이어의 원래 자리에 맞춤).
import { makeSectionShell } from './section-shell.js';
import { getDocWorldTr, getLayerBounds, getParentWorldTr, worldToLocalInParent } from '../canvas/hit.js';
import { buildPropCmd } from '../canvas/edit-prop.js';

const _IDENTITY = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };

// 회전 무시한 월드 공간 축 정렬 bbox + anchor 오프셋 정보.
// useCamera=true 면 카메라 적용(출력 픽셀) 월드, false 면 카메라 없는 원래 문서 월드.
function _layerBox(doc, id, f, useCamera) {
  const layer = doc.layers[id];
  if (!layer) return null;
  const tr = getDocWorldTr(doc, id, f, { camera: useCamera });
  const b  = getLayerBounds(layer);
  if (!tr || !b) return null;
  const sx = (tr.scale ?? 1) * (tr.scaleX ?? 1);
  const sy = (tr.scale ?? 1) * (tr.scaleY ?? 1);
  const cx = tr.x + (b.ox ?? 0) * sx;   // bbox 중심 (월드)
  const cy = tr.y + (b.oy ?? 0) * sy;
  const hw = b.hw * sx, hh = b.hh * sy;
  return { s: tr.scale ?? 1, sx, sy, cx, cy, hw, hh, ox: b.ox ?? 0, oy: b.oy ?? 0 };
}

// 월드 anchor → 레이어 로컬 transform 값. useCamera 면 카메라를 포함한 부모로, 아니면 카메라 없는 부모로 역변환.
function _toLocal(doc, id, f, worldX, worldY, useCamera) {
  const layer = doc.layers[id];
  let parentTr;
  if (layer?.parentId) parentTr = getDocWorldTr(doc, layer.parentId, f, { camera: useCamera });
  else parentTr = useCamera ? getParentWorldTr(doc, id, f) : _IDENTITY;
  return worldToLocalInParent(worldX, worldY, parentTr);
}

export function createAlignSection(store, editorState) {
  const { section, body } = makeSectionShell('정렬', false);
  let _ignoreCamera = false;

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

  // 분배(F2-9) — 3개 이상 선택 시 가로·세로 간격 균등
  const distRow = document.createElement('div'); distRow.className = 'align-row';
  for (const [key, label] of [['dist-h', '가로 분배'], ['dist-v', '세로 분배']]) {
    const b = document.createElement('button');
    b.className = 'align-btn'; b.dataset.align = key; b.textContent = label;
    b.title = label + ' (3개 이상 선택)';
    b.addEventListener('click', () => _distribute(key === 'dist-h' ? 'x' : 'y'));
    distRow.appendChild(b);
  }
  body.appendChild(distRow);

  // "카메라 무시" — 끄면(기본) 보이는 화면 기준, 켜면 원래 문서 좌표 기준.
  const camRow = document.createElement('label'); camRow.className = 'align-row ex-inline';
  const camChk = document.createElement('input'); camChk.type = 'checkbox'; camChk.className = 'align-ignore-cam';
  camChk.addEventListener('change', () => { _ignoreCamera = camChk.checked; });
  camRow.append(camChk, document.createTextNode(' 카메라 무시(원래 문서 좌표)'));
  body.appendChild(camRow);
  // 그리드 간격은 레이어 속성이 아니라 화면 설정 → 캔버스 "보기" 메뉴로 옮김(item 7, view.js).

  function _align(key) {
    const es  = editorState.get();
    const doc = store.get();
    const ids = es.selection.filter(id => doc.layers[id] && !doc.layers[id].locked);
    if (!ids.length) return;
    const f = es.f;
    const useCamera = !_ignoreCamera;

    const boxes = ids.map(id => ({ id, box: _layerBox(doc, id, f, useCamera) })).filter(x => x.box);
    if (!boxes.length) return;

    // 기준 영역 — 하나면 출력 프레임(0..docW/H), 여럿이면 선택 bbox.
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
      // 중심 → anchor 월드 좌표 → 레이어 로컬 값(회전 무시)
      const worldX = targetCx - box.ox * box.sx;
      const worldY = targetCy - box.oy * box.sy;
      const loc = _toLocal(doc, id, f, worldX, worldY, useCamera);
      if (key === 'left' || key === 'hcenter' || key === 'right') {
        cmds.push(buildPropCmd(doc, id, 'transform.x', loc.x, f, es.autoKey));
      } else {
        cmds.push(buildPropCmd(doc, id, 'transform.y', loc.y, f, es.autoKey));
      }
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  // 분배 — 3개 이상, 가장자리 둘은 고정, 중간을 중심 기준 균등 간격. 기록 1건.
  function _distribute(axis) {
    const es  = editorState.get();
    const doc = store.get();
    const ids = es.selection.filter(id => doc.layers[id] && !doc.layers[id].locked);
    if (ids.length < 3) return;
    const f = es.f;
    const useCamera = !_ignoreCamera;
    const items = ids.map(id => ({ id, box: _layerBox(doc, id, f, useCamera) })).filter(x => x.box);
    if (items.length < 3) return;
    const cKey = axis === 'x' ? 'cx' : 'cy';
    items.sort((a, b) => a.box[cKey] - b.box[cKey]);
    const min = items[0].box[cKey];
    const max = items[items.length - 1].box[cKey];
    const step = (max - min) / (items.length - 1);
    const cmds = [];
    for (let i = 1; i < items.length - 1; i++) {
      const it = items[i];
      const targetC = min + step * i;
      // 중심 → anchor 월드 → 로컬
      const worldX = axis === 'x' ? targetC - it.box.ox * it.box.sx : it.box.cx - it.box.ox * it.box.sx;
      const worldY = axis === 'y' ? targetC - it.box.oy * it.box.sy : it.box.cy - it.box.oy * it.box.sy;
      const loc = _toLocal(doc, it.id, f, worldX, worldY, useCamera);
      cmds.push(buildPropCmd(doc, it.id, axis === 'x' ? 'transform.x' : 'transform.y', axis === 'x' ? loc.x : loc.y, f, es.autoKey));
    }
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  return { el: section, destroy() {} };
}
