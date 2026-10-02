import { hitTest, getDocWorldTr, getLayerBounds } from './hit.js';
import { screenToDoc, localToScreen } from './transform.js';
import { computeSnap } from './snap.js';
import { buildPropCmd, getStartValue } from './edit-prop.js';

const HANDLE_RADIUS = 10; // 핸들 감지 반경 (화면 픽셀)
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // 코너 부호 (hw, hh 곱할 값)

// CSS 픽셀 거리
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

export function initDrag(overlayCanvas, store, editorState, onSnapLines, onDraftMode = () => {}) {
  // type: 'move' | 'scale' | 'rotate'
  let _drag = null;
  let _draftActive = false;

  // 오버레이 캔버스 CSS 크기 (이벤트 좌표와 일치)
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

  // 핸들 위치 히트 검사 (단일 선택 시에만)
  function _checkHandleHit(cx, cy) {
    const es = editorState.get();
    const { selection, f, zoom, panX, panY } = es;
    if (selection.length !== 1) return null;

    const id  = selection[0];
    const doc = store.get();
    const layer = doc.layers[id];
    if (!layer) return null;

    const worldTr = getDocWorldTr(doc, id, f);
    const bounds  = getLayerBounds(layer);
    if (!worldTr || !bounds) return null;

    const { W, H } = _cssSize();
    const { width: docW, height: docH } = doc.meta;
    const { hw, hh } = bounds;

    // 회전 핸들
    const rotH = localToScreen(0, -hh - 20, worldTr, zoom, panX, panY, W, H, docW, docH);
    if (_dist(cx, cy, rotH.x, rotH.y) <= HANDLE_RADIUS) {
      return { type: 'rotate', id };
    }

    // 코너 핸들 (0=좌상, 1=우상, 2=우하, 3=좌하)
    for (let i = 0; i < 4; i++) {
      const [sx, sy] = CORNERS[i];
      const sp = localToScreen(sx * hw, sy * hh, worldTr, zoom, panX, panY, W, H, docW, docH);
      if (_dist(cx, cy, sp.x, sp.y) <= HANDLE_RADIUS) {
        return { type: 'corner', cornerIdx: i, id };
      }
    }
    return null;
  }

  function _onPointerDown(e) {
    if (e.button !== 0) return;
    const es = editorState.get();
    if (es.tool !== 'select') return;

    const { cx, cy } = _canvasCoord(e);

    // 핸들 히트 먼저
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

    // 더블클릭: 그룹 진입
    if (e.detail === 2 && doc.layers[layerId]?.type === 'group') {
      editorState.set({ groupEdit: layerId, selection: [] });
      return;
    }

    // Shift+클릭: 다중 선택 토글
    let newSelection;
    if (e.shiftKey) {
      if (selection.includes(layerId)) {
        newSelection = selection.filter(id => id !== layerId);
      } else {
        newSelection = [...selection, layerId];
      }
    } else {
      // 이미 선택된 레이어 그룹을 클릭하면 다중 드래그 유지
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
    const { id } = handleHit;
    const layer = doc.layers[id];
    if (!layer) return;

    const worldTr = getDocWorldTr(doc, id, f);
    const bounds  = getLayerBounds(layer);
    if (!worldTr || !bounds) return;

    const docPos = _toDoc(cx, cy);

    if (handleHit.type === 'rotate') {
      _drag = {
        type: 'rotate',
        id,
        origRot: getStartValue(doc, id, 'transform.rotation', f),
        centerDocX: worldTr.x,
        centerDocY: worldTr.y,
        startAngle: Math.atan2(docPos.y - worldTr.y, docPos.x - worldTr.x),
      };
      store.begin('회전');
    } else {
      // 크기 조절: 반대쪽 코너를 피벗으로
      const { hw, hh } = bounds;
      const ci  = handleHit.cornerIdx;
      const [csx, csy] = CORNERS[ci];
      const [osx, osy] = CORNERS[(ci + 2) % 4];

      const rad = (worldTr.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const s   = worldTr.scale ?? 1;

      const pivotDocX    = worldTr.x + s * (osx * hw * cos - osy * hh * sin);
      const pivotDocY    = worldTr.y + s * (osx * hw * sin + osy * hh * cos);
      const origCornerDX = worldTr.x + s * (csx * hw * cos - csy * hh * sin) - pivotDocX;
      const origCornerDY = worldTr.y + s * (csx * hw * sin + csy * hh * cos) - pivotDocY;
      const origDist     = Math.sqrt(origCornerDX ** 2 + origCornerDY ** 2) || 1;

      _drag = {
        type: 'scale',
        id,
        origLocalScale:  getStartValue(doc, id, 'transform.scale', f),
        origLocalX:      getStartValue(doc, id, 'transform.x', f),
        origLocalY:      getStartValue(doc, id, 'transform.y', f),
        origWorldScale:  worldTr.scale ?? 1,
        origCenterDocX:  worldTr.x,
        origCenterDocY:  worldTr.y,
        isRoot:          !layer.parentId,
        pivotDocX, pivotDocY,
        origDist,
        dirX: origCornerDX / origDist,
        dirY: origCornerDY / origDist,
      };
      store.begin('크기 조절');
    }

    overlayCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function _onPointerMove(e) {
    if (!_drag) return;

    if (!_draftActive) {
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
      _onScaleMove(docPos, f, autoKey);
    } else if (_drag.type === 'rotate') {
      _onRotateMove(docPos, f, autoKey, e.shiftKey);
    }
  }

  function _onMoveMove(docPos, es, f, autoKey, e) {
    const { ids, origPositions, startDocX, startDocY } = _drag;
    let ddx = docPos.x - startDocX;
    let ddy = docPos.y - startDocY;

    // Shift: 축 고정
    if (e.shiftKey) {
      if (Math.abs(ddx) > Math.abs(ddy)) ddy = 0; else ddx = 0;
    }

    if (ids.length === 1) {
      const { id, x: origX, y: origY, parentWorldTr } = origPositions[0];
      const { dx, dy } = _worldDeltaToLocal(ddx, ddy, parentWorldTr);

      const snapResult = computeSnap(origX + dx, origY + dy, store.get(), es, [id], e.altKey);
      onSnapLines(snapResult.lines);

      // 순서 중요: x preview 후 store.get()이 업데이트된 상태에서 y 계산
      store.preview(buildPropCmd(store.get(), id, 'transform.x', snapResult.x, f, autoKey));
      store.preview(buildPropCmd(store.get(), id, 'transform.y', snapResult.y, f, autoKey));
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

  function _onScaleMove(docPos, f, autoKey) {
    const { id, origLocalScale, origLocalX, origLocalY, origWorldScale, origCenterDocX, origCenterDocY, isRoot, pivotDocX, pivotDocY, origDist, dirX, dirY } = _drag;

    const ndx = docPos.x - pivotDocX;
    const ndy = docPos.y - pivotDocY;
    const signedDist = ndx * dirX + ndy * dirY;
    const k = Math.max(0.05, signedDist / origDist);

    // 로컬 스케일 = 원본 로컬 × k
    const newLocalScale = origLocalScale * k;

    const currentDoc = store.get();
    const cmds = [buildPropCmd(currentDoc, id, 'transform.scale', newLocalScale, f, autoKey)];

    // 루트 레이어: 피벗(반대쪽 코너) 고정 위치 보정
    if (isRoot) {
      const newCenterX = pivotDocX + k * (origCenterDocX - pivotDocX);
      const newCenterY = pivotDocY + k * (origCenterDocY - pivotDocY);
      cmds.push(buildPropCmd(currentDoc, id, 'transform.x', newCenterX, f, autoKey));
      cmds.push(buildPropCmd(currentDoc, id, 'transform.y', newCenterY, f, autoKey));
    }

    store.preview({ type: 'batch', cmds });
  }

  function _onRotateMove(docPos, f, autoKey, shiftKey) {
    const { id, origRot, centerDocX, centerDocY, startAngle } = _drag;

    const currentAngle = Math.atan2(docPos.y - centerDocY, docPos.x - centerDocX);
    let newRot = origRot + (currentAngle - startAngle) * 180 / Math.PI;

    if (shiftKey) {
      newRot = Math.round(newRot / 15) * 15;
    }

    store.preview(buildPropCmd(store.get(), id, 'transform.rotation', newRot, f, autoKey));
  }

  function _onPointerUp(e) {
    if (!_drag) return;
    store.commit();
    _drag = null;
    onSnapLines([]);
    if (_draftActive) { _draftActive = false; onDraftMode(false); }
    overlayCanvas.releasePointerCapture(e.pointerId);
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape' && _drag) {
      store.cancel();
      _drag = null;
      onSnapLines([]);
      if (_draftActive) { _draftActive = false; onDraftMode(false); }
      // 선택은 유지 (keys.js가 Esc를 처리하지 못하도록 전파 중단)
      e.stopImmediatePropagation();
      return;
    }
  }

  overlayCanvas.addEventListener('pointerdown', _onPointerDown);
  overlayCanvas.addEventListener('pointermove', _onPointerMove);
  overlayCanvas.addEventListener('pointerup',   _onPointerUp);
  document.addEventListener('keydown', _onKeyDown);

  return {
    cleanup() {
      overlayCanvas.removeEventListener('pointerdown', _onPointerDown);
      overlayCanvas.removeEventListener('pointermove', _onPointerMove);
      overlayCanvas.removeEventListener('pointerup',   _onPointerUp);
      document.removeEventListener('keydown', _onKeyDown);
    },
    isDragging() { return _drag !== null; },
  };
}
