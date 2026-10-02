import { hitTest, getDocWorldTr, getLayerBounds } from './hit.js';
import { screenToDoc, localToScreen } from './transform.js';
import { computeSnap } from './snap.js';
import { buildPropCmd, getStartValue } from './edit-prop.js';

const HANDLE_RADIUS = 10; // 핸들 감지 반경 (화면 픽셀)
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // 코너 부호 (hw, hh 곱할 값)

function _dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// 월드 델타를 부모 로컬 공간으로 역변환 (그룹 자식 이동 시)
function _worldDeltaToLocal(ddx, ddy, parentWorldTr) {
  if (!parentWorldTr) return { dx: ddx, dy: ddy };
  const rad = -(parentWorldTr.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = parentWorldTr.scale ?? 1;
  return {
    dx: (ddx * cos - ddy * sin) / s,
    dy: (ddx * sin + ddy * cos) / s,
  };
}

export function initDrag(overlayCanvas, store, editorState, onSnapLines, onDraftMode = () => {}, shouldDraft = () => false) {
  let _drag = null;
  let _draftActive = false;

  function _cssSize() {
    const r = overlayCanvas.getBoundingClientRect();
    return { W: r.width, H: r.height };
  }

  function _canvasCoord(e) {
    const rect = overlayCanvas.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  }

  function _toDoc(cx, cy) {
    const { W, H } = _cssSize();
    const es  = editorState.get();
    const doc = store.get();
    return screenToDoc(cx, cy, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }

  // 핸들 위치 히트 검사
  function _checkHandleHit(cx, cy) {
    const es = editorState.get();
    const { selection, f, zoom, panX, panY } = es;

    // 단일 선택: 레이어 핸들
    if (selection.length === 1) {
      const id  = selection[0];
      const doc = store.get();
      const layer = doc.layers[id];
      if (!layer) return null;
      const worldTr = getDocWorldTr(doc, id, f);
      const bounds  = getLayerBounds(layer);
      if (!worldTr || !bounds) return null;

      const { W, H } = _cssSize();
      const { width: docW, height: docH } = doc.meta;
      const { hw, hh, ox = 0, oy = 0 } = bounds;

      // 회전 핸들
      const rotH = localToScreen(ox, oy - hh - 20, worldTr, zoom, panX, panY, W, H, docW, docH);
      if (_dist(cx, cy, rotH.x, rotH.y) <= HANDLE_RADIUS) {
        return { type: 'rotate', id };
      }

      // 코너 핸들
      for (let i = 0; i < 4; i++) {
        const [sx, sy] = CORNERS[i];
        const sp = localToScreen(ox + sx * hw, oy + sy * hh, worldTr, zoom, panX, panY, W, H, docW, docH);
        if (_dist(cx, cy, sp.x, sp.y) <= HANDLE_RADIUS) {
          return { type: 'corner', cornerIdx: i, id };
        }
      }
      return null;
    }

    // 다중 선택: AABB 코너 핸들
    if (selection.length > 1) {
      const doc = store.get();
      const { f, zoom, panX, panY } = es;
      const { W, H } = _cssSize();
      const { width: docW, height: docH } = doc.meta;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selection) {
        const layer = doc.layers[id];
        if (!layer) continue;
        const worldTr = getDocWorldTr(doc, id, f);
        const bounds  = getLayerBounds(layer);
        if (!worldTr || !bounds) continue;
        const { hw, hh, ox = 0, oy = 0 } = bounds;
        for (const [lx, ly] of [[ox-hw,oy-hh],[ox+hw,oy-hh],[ox+hw,oy+hh],[ox-hw,oy+hh]]) {
          const sp = localToScreen(lx, ly, worldTr, zoom, panX, panY, W, H, docW, docH);
          if (sp.x < minX) minX = sp.x;
          if (sp.y < minY) minY = sp.y;
          if (sp.x > maxX) maxX = sp.x;
          if (sp.y > maxY) maxY = sp.y;
        }
      }
      if (minX < Infinity) {
        const aabbCorners = [[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]];
        for (let i = 0; i < 4; i++) {
          const [scx, scy] = aabbCorners[i];
          if (_dist(cx, cy, scx, scy) <= HANDLE_RADIUS) {
            return { type: 'aabb-corner', cornerIdx: i, aabb: { minX, minY, maxX, maxY } };
          }
        }
      }
    }

    return null;
  }

  function _onPointerDown(e) {
    if (e.button !== 0) return;
    const es = editorState.get();
    if (es.tool !== 'select') return;

    const { cx, cy } = _canvasCoord(e);

    const handleHit = _checkHandleHit(cx, cy);
    if (handleHit) {
      _startHandleDrag(e, handleHit, cx, cy);
      return;
    }

    const doc = store.get();
    const { f, groupEdit, selection } = es;
    const docPos = _toDoc(cx, cy);

    const layerId = hitTest(doc, docPos.x, docPos.y, f, groupEdit);
    if (!layerId) {
      if (!e.shiftKey) editorState.set({ selection: [] });
      return;
    }

    if (e.detail === 2 && doc.layers[layerId]?.type === 'group') {
      editorState.set({ groupEdit: layerId, selection: [] });
      return;
    }

    let newSelection;
    if (e.shiftKey) {
      if (selection.includes(layerId)) {
        newSelection = selection.filter(id => id !== layerId);
      } else {
        newSelection = [...selection, layerId];
      }
    } else {
      if (selection.length > 1 && selection.includes(layerId)) {
        newSelection = selection;
      } else {
        newSelection = [layerId];
      }
    }
    editorState.set({ selection: newSelection });

    if (!newSelection.length) return;

    _startMoveDrag(e, newSelection, docPos, doc, f);
  }

  function _startMoveDrag(e, ids, docPos, doc, f) {
    const origPositions = ids.map(id => {
      const layer = doc.layers[id];
      const parentWorldTr = layer?.parentId
        ? getDocWorldTr(doc, layer.parentId, f)
        : null;
      return {
        id,
        x: getStartValue(doc, id, 'transform.x', f),
        y: getStartValue(doc, id, 'transform.y', f),
        parentWorldTr,
      };
    });

    _drag = { type: 'move', ids, origPositions, startDocX: docPos.x, startDocY: docPos.y };
    overlayCanvas.setPointerCapture(e.pointerId);
    store.begin('이동');
    e.preventDefault();
  }

  function _startHandleDrag(e, handleHit, cx, cy) {
    const doc = store.get();
    const es  = editorState.get();
    const { f } = es;
    const docPos = _toDoc(cx, cy);

    if (handleHit.type === 'aabb-corner') {
      // 다중 선택 AABB 크기 조절
      const { aabb, cornerIdx } = handleHit;
      const ids = es.selection;
      const oppIdx = (cornerIdx + 2) % 4;
      const aabbCorners = [
        [aabb.minX, aabb.minY], [aabb.maxX, aabb.minY],
        [aabb.maxX, aabb.maxY], [aabb.minX, aabb.maxY],
      ];
      const [pivotSX, pivotSY] = aabbCorners[oppIdx];
      const [dragSX, dragSY]   = aabbCorners[cornerIdx];

      // pivot을 doc 좌표로 변환 (AABB가 CSS픽셀 기준)
      const { W, H } = _cssSize();
      const pivotDoc  = _toDoc(pivotSX, pivotSY);
      const dragScrDX = dragSX - pivotSX;
      const dragScrDY = dragSY - pivotSY;
      const origDist  = Math.sqrt(dragScrDX ** 2 + dragScrDY ** 2) || 1;

      _drag = {
        type: 'aabb-scale',
        ids,
        pivotSX, pivotSY,
        pivotDoc,
        origDist,
        dirX: dragScrDX / origDist,
        dirY: dragScrDY / origDist,
        origScales: ids.map(id => ({
          id,
          scale: getStartValue(doc, id, 'transform.scale', f),
          x: getStartValue(doc, id, 'transform.x', f),
          y: getStartValue(doc, id, 'transform.y', f),
          worldTr: getDocWorldTr(doc, id, f),
        })),
      };
      overlayCanvas.setPointerCapture(e.pointerId);
      store.begin('크기 조절');
      e.preventDefault();
      return;
    }

    const { id } = handleHit;
    const layer = doc.layers[id];
    if (!layer) return;

    const worldTr = getDocWorldTr(doc, id, f);
    const bounds  = getLayerBounds(layer);
    if (!worldTr || !bounds) return;

    if (handleHit.type === 'rotate') {
      const startAngle = Math.atan2(docPos.y - worldTr.y, docPos.x - worldTr.x);
      _drag = {
        type: 'rotate',
        id,
        origRot: getStartValue(doc, id, 'transform.rotation', f),
        centerDocX: worldTr.x,
        centerDocY: worldTr.y,
        lastAngle: startAngle,
        accRot: 0,
      };
      store.begin('회전');
    } else {
      const { hw, hh, ox = 0, oy = 0 } = bounds;
      const ci  = handleHit.cornerIdx;
      const [csx, csy] = CORNERS[ci];
      const [osx, osy] = CORNERS[(ci + 2) % 4];

      const rad = (worldTr.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const s   = worldTr.scale ?? 1;

      // 피벗 = 반대쪽 코너
      const pivotLx = ox + osx * hw;
      const pivotLy = oy + osy * hh;
      const pivotDocX = worldTr.x + s * (pivotLx * cos - pivotLy * sin);
      const pivotDocY = worldTr.y + s * (pivotLx * sin + pivotLy * cos);

      // 드래그 코너
      const dragLx = ox + csx * hw;
      const dragLy = oy + csy * hh;
      const dragDocX = worldTr.x + s * (dragLx * cos - dragLy * sin);
      const dragDocY = worldTr.y + s * (dragLx * sin + dragLy * cos);

      const origCornerDX = dragDocX - pivotDocX;
      const origCornerDY = dragDocY - pivotDocY;
      const origDist = Math.sqrt(origCornerDX ** 2 + origCornerDY ** 2) || 1;

      // Shift용: 레이어 실제 중심 (anchor 오프셋 고려)
      const centerLx = ox, centerLy = oy;
      const centerDocX = worldTr.x + s * (centerLx * cos - centerLy * sin);
      const centerDocY = worldTr.y + s * (centerLx * sin + centerLy * cos);
      const centerCornerDX = dragDocX - centerDocX;
      const centerCornerDY = dragDocY - centerDocY;
      const origCenterDist = Math.sqrt(centerCornerDX ** 2 + centerCornerDY ** 2) || 1;

      _drag = {
        type: 'scale',
        id,
        origLocalScale:  getStartValue(doc, id, 'transform.scale', f),
        origLocalX:      getStartValue(doc, id, 'transform.x', f),
        origLocalY:      getStartValue(doc, id, 'transform.y', f),
        origAnchorDocX:  worldTr.x,
        origAnchorDocY:  worldTr.y,
        isRoot:          !layer.parentId,
        pivotDocX, pivotDocY,
        origDist,
        dirX: origCornerDX / origDist,
        dirY: origCornerDY / origDist,
        centerDocX, centerDocY,
        origCenterDist,
        centerDirX: centerCornerDX / origCenterDist,
        centerDirY: centerCornerDY / origCenterDist,
      };
      store.begin('크기 조절');
    }

    overlayCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function _onPointerMove(e) {
    if (!_drag) return;

    if (!_draftActive && shouldDraft()) {
      _draftActive = true;
      onDraftMode(true);
    }

    const { cx, cy } = _canvasCoord(e);
    const docPos = _toDoc(cx, cy);
    const es  = editorState.get();
    const { f, autoKey } = es;

    if (_drag.type === 'move') {
      _onMoveMove(docPos, es, f, autoKey, e);
    } else if (_drag.type === 'scale') {
      _onScaleMove(docPos, f, autoKey, e.shiftKey);
    } else if (_drag.type === 'rotate') {
      _onRotateMove(docPos, f, autoKey, e.shiftKey);
    } else if (_drag.type === 'aabb-scale') {
      _onAabbScaleMove(e, f, autoKey);
    }
  }

  function _onMoveMove(docPos, es, f, autoKey, e) {
    const { ids, origPositions, startDocX, startDocY } = _drag;
    let ddx = docPos.x - startDocX;
    let ddy = docPos.y - startDocY;

    if (e.shiftKey) {
      if (Math.abs(ddx) > Math.abs(ddy)) ddy = 0; else ddx = 0;
    }

    if (ids.length === 1) {
      const { id, x: origX, y: origY, parentWorldTr } = origPositions[0];
      const { dx, dy } = _worldDeltaToLocal(ddx, ddy, parentWorldTr);
      const localX = origX + dx;
      const localY = origY + dy;

      let finalX, finalY;
      if (parentWorldTr) {
        // 그룹 자식: world 좌표로 snap 후 local로 역변환
        const rad = (parentWorldTr.rotation ?? 0) * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const sv  = parentWorldTr.scale ?? 1;
        const worldX = parentWorldTr.x + sv * (localX * cos - localY * sin);
        const worldY = parentWorldTr.y + sv * (localX * sin + localY * cos);
        const snapResult = computeSnap(worldX, worldY, store.get(), es, [id], e.altKey);
        onSnapLines(snapResult.lines);
        const { dx: ldx, dy: ldy } = _worldDeltaToLocal(snapResult.x - worldX, snapResult.y - worldY, parentWorldTr);
        finalX = localX + ldx;
        finalY = localY + ldy;
      } else {
        const snapResult = computeSnap(localX, localY, store.get(), es, [id], e.altKey);
        onSnapLines(snapResult.lines);
        finalX = snapResult.x;
        finalY = snapResult.y;
      }

      store.preview(buildPropCmd(store.get(), id, 'transform.x', finalX, f, autoKey));
      store.preview(buildPropCmd(store.get(), id, 'transform.y', finalY, f, autoKey));
    } else {
      onSnapLines([]);
      const currentDoc = store.get();
      const cmds = [];
      for (const { id, x: origX, y: origY, parentWorldTr } of origPositions) {
        const layer = currentDoc.layers[id];
        if (!layer || layer.locked) continue;
        const { dx, dy } = _worldDeltaToLocal(ddx, ddy, parentWorldTr);
        cmds.push(buildPropCmd(currentDoc, id, 'transform.x', origX + dx, f, autoKey));
        cmds.push(buildPropCmd(currentDoc, id, 'transform.y', origY + dy, f, autoKey));
      }
      if (cmds.length) store.preview({ type: 'batch', cmds });
    }
  }

  function _onScaleMove(docPos, f, autoKey, shiftKey) {
    const {
      id, origLocalScale, origAnchorDocX, origAnchorDocY, isRoot,
      pivotDocX, pivotDocY, origDist, dirX, dirY,
      centerDocX, centerDocY, origCenterDist, centerDirX, centerDirY,
    } = _drag;

    const ePivotX   = shiftKey ? centerDocX   : pivotDocX;
    const ePivotY   = shiftKey ? centerDocY   : pivotDocY;
    const eDirX     = shiftKey ? centerDirX   : dirX;
    const eDirY     = shiftKey ? centerDirY   : dirY;
    const eOrigDist = shiftKey ? origCenterDist : origDist;

    const ndx = docPos.x - ePivotX;
    const ndy = docPos.y - ePivotY;
    const signedDist = ndx * eDirX + ndy * eDirY;
    const k = Math.max(0.05, signedDist / eOrigDist);

    const newLocalScale = origLocalScale * k;
    const currentDoc = store.get();
    const cmds = [buildPropCmd(currentDoc, id, 'transform.scale', newLocalScale, f, autoKey)];

    if (isRoot) {
      if (shiftKey) {
        // Shift: anchor(=레이어 중심) 고정
        cmds.push(buildPropCmd(currentDoc, id, 'transform.x', origAnchorDocX, f, autoKey));
        cmds.push(buildPropCmd(currentDoc, id, 'transform.y', origAnchorDocY, f, autoKey));
      } else {
        // 피벗(반대쪽 코너) 기준 위치 보정
        const newAnchorX = ePivotX + k * (origAnchorDocX - ePivotX);
        const newAnchorY = ePivotY + k * (origAnchorDocY - ePivotY);
        cmds.push(buildPropCmd(currentDoc, id, 'transform.x', newAnchorX, f, autoKey));
        cmds.push(buildPropCmd(currentDoc, id, 'transform.y', newAnchorY, f, autoKey));
      }
    }

    store.preview({ type: 'batch', cmds });
  }

  function _onAabbScaleMove(e, f, autoKey) {
    const { ids, pivotSX, pivotSY, origDist, dirX, dirY, origScales } = _drag;
    const rect = overlayCanvas.getBoundingClientRect();
    const curSX = e.clientX - rect.left;
    const curSY = e.clientY - rect.top;

    const ndx = curSX - pivotSX;
    const ndy = curSY - pivotSY;
    const signedDist = ndx * dirX + ndy * dirY;
    const k = Math.max(0.05, signedDist / origDist);

    const currentDoc = store.get();
    const cmds = [];
    for (const { id, scale: origScale, x: origX, y: origY, worldTr } of origScales) {
      const layer = currentDoc.layers[id];
      if (!layer || layer.locked) continue;
      cmds.push(buildPropCmd(currentDoc, id, 'transform.scale', origScale * k, f, autoKey));
      if (!layer.parentId) {
        // pivot을 doc 좌표로 고정
        const pivotDoc = _drag.pivotDoc;
        cmds.push(buildPropCmd(currentDoc, id, 'transform.x', pivotDoc.x + k * (origX - pivotDoc.x), f, autoKey));
        cmds.push(buildPropCmd(currentDoc, id, 'transform.y', pivotDoc.y + k * (origY - pivotDoc.y), f, autoKey));
      }
    }
    if (cmds.length) store.preview({ type: 'batch', cmds });
  }

  function _onRotateMove(docPos, f, autoKey, shiftKey) {
    const { id, origRot, centerDocX, centerDocY } = _drag;

    const currentAngle = Math.atan2(docPos.y - centerDocY, docPos.x - centerDocX);
    let diff = currentAngle - _drag.lastAngle;
    // [-π, π] 범위로 감싸 경계 넘을 때 점프 방지
    if (diff > Math.PI)  diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    _drag.lastAngle = currentAngle;
    _drag.accRot += diff;

    let newRot = origRot + _drag.accRot * 180 / Math.PI;
    if (shiftKey) newRot = Math.round(newRot / 15) * 15;

    store.preview(buildPropCmd(store.get(), id, 'transform.rotation', newRot, f, autoKey));
  }

  function _endDrag(commit) {
    if (!_drag) return;
    if (commit) store.commit(); else store.cancel();
    _drag = null;
    onSnapLines([]);
    if (_draftActive) { _draftActive = false; onDraftMode(false); }
  }

  function _onPointerUp(e) {
    if (!_drag) return;
    _endDrag(true);
    try { overlayCanvas.releasePointerCapture(e.pointerId); } catch {}
  }

  function _onPointerCancel() {
    if (!_drag) return;
    _endDrag(false);
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape' && _drag) {
      _endDrag(false);
      e.stopImmediatePropagation();
    }
  }

  overlayCanvas.addEventListener('pointerdown',        _onPointerDown);
  overlayCanvas.addEventListener('pointermove',        _onPointerMove);
  overlayCanvas.addEventListener('pointerup',          _onPointerUp);
  overlayCanvas.addEventListener('pointercancel',      _onPointerCancel);
  overlayCanvas.addEventListener('lostpointercapture', _onPointerCancel);
  document.addEventListener('keydown', _onKeyDown);

  return {
    cleanup() {
      overlayCanvas.removeEventListener('pointerdown',        _onPointerDown);
      overlayCanvas.removeEventListener('pointermove',        _onPointerMove);
      overlayCanvas.removeEventListener('pointerup',          _onPointerUp);
      overlayCanvas.removeEventListener('pointercancel',      _onPointerCancel);
      overlayCanvas.removeEventListener('lostpointercapture', _onPointerCancel);
      document.removeEventListener('keydown', _onKeyDown);
    },
    isDragging() { return _drag !== null; },
  };
}
