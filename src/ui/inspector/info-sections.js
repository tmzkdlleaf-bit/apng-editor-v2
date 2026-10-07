// 인스펙터 — 움직이는 이미지 · 그룹 · 카메라 섹션 자리(F1-9).
// 이번에는 "틀과 표시만"(읽기 전용 정보). 실제 편집(재생 설정·기준점·카메라 키프레임)은 F2.
import { makeSectionShell } from './section-shell.js';
import { cameraHasKeys } from '../timeline/rows.js';

function _infoRow(label, value) {
  const row = document.createElement('div'); row.className = 'info-row';
  const l = document.createElement('span'); l.className = 'info-label'; l.textContent = label;
  const v = document.createElement('span'); v.className = 'info-value'; v.textContent = value;
  row.append(l, v); return row;
}
function _note(text) {
  const d = document.createElement('div'); d.className = 'info-note'; d.textContent = text; return d;
}

// ── 움직이는 이미지(anim) 소스 정보 ───────────────────────────────────────
export function createAnimSection(store, editorState) {
  const { section, body } = makeSectionShell('움직이는 이미지', true);
  const ids = () => { const doc = store.get(); return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'anim'); };

  function _refresh() {
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const doc = store.get();
    const layer = doc.layers[list[0]];
    const meta = doc.assets?.[layer.assetId];
    const fc = meta?.frameCount ?? null;
    const fps = meta?.fps ?? doc.meta.fps;
    body.textContent = '';
    body.append(
      _infoRow('크기', meta ? `${meta.width} × ${meta.height}` : '-'),
      _infoRow('프레임 수', fc != null ? `${fc}` : '-'),
      _infoRow('길이', fc != null ? `${(fc / Math.max(1, fps)).toFixed(2)}초` : '-'),
      _note('재생 설정(속도·오프셋·모드)은 다음 업데이트에 들어갑니다.'),
    );
  }
  return _wire(section, store, editorState, _refresh);
}

// ── 그룹 정보 ─────────────────────────────────────────────────────────────
export function createGroupSection(store, editorState) {
  const { section, body } = makeSectionShell('그룹', true);
  const ids = () => { const doc = store.get(); return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'group'); };

  function _refresh() {
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const doc = store.get();
    const g = doc.layers[list[0]];
    const n = (g.childOrder ?? []).length;
    const ax = g.anchor?.x ?? 0.5, ay = g.anchor?.y ?? 0.5;
    body.textContent = '';
    body.append(
      _infoRow('자식 수', `${n}개`),
      _infoRow('기준점', `${Math.round(ax * 100)}% , ${Math.round(ay * 100)}%`),
      _infoRow('컴포넌트', g.isComponent ? '예' : '아니오'),
      _note('기준점 편집·컴포넌트화는 다음 업데이트에 들어갑니다.'),
    );
  }
  return _wire(section, store, editorState, _refresh);
}

// ── 카메라 정보 ───────────────────────────────────────────────────────────
// 카메라는 레이어가 아니라 문서 속성(doc.camera). 키프레임이 있을 때(타임라인 카메라 행) 표시.
export function createCameraSection(store, editorState) {
  const { section, body } = makeSectionShell('카메라', true);

  function _refresh() {
    const doc = store.get();
    const show = cameraHasKeys(doc);
    section.style.display = show ? '' : 'none';
    if (!show) return;
    const cam = doc.camera ?? {};
    const kx = (cam.x?.keys ?? []).length, ky = (cam.y?.keys ?? []).length, kz = (cam.zoom?.keys ?? []).length;
    body.textContent = '';
    body.append(
      _infoRow('X', `${Math.round(cam.x?.value ?? 0)}  (키 ${kx})`),
      _infoRow('Y', `${Math.round(cam.y?.value ?? 0)}  (키 ${ky})`),
      _infoRow('줌', `${Math.round((cam.zoom?.value ?? 1) * 100)}%  (키 ${kz})`),
      _note('카메라 키프레임 편집은 다음 업데이트에 들어갑니다.'),
    );
  }
  // 카메라는 selection 과 무관 — 문서(meta/camera) 변화에도 갱신
  const unsubStore = store.subscribe({ any: true }, _refresh);
  _refresh();
  return { el: section, destroy() { unsubStore(); } };
}

function _wire(section, store, editorState, refresh) {
  const unsubStore = store.subscribe({ layers: true }, refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) refresh(); });
  refresh();
  return { el: section, destroy() { unsubStore(); unsubES(); } };
}
