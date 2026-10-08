// 인스펙터 — 움직이는 이미지 · 그룹 · 카메라 섹션 자리(F1-9).
// 이번에는 "틀과 표시만"(읽기 전용 정보). 실제 편집(재생 설정·기준점·카메라 키프레임)은 F2.
import { makeSectionShell } from './section-shell.js';

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

function _wire(section, store, editorState, refresh) {
  const unsubStore = store.subscribe({ layers: true }, refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) refresh(); });
  refresh();
  return { el: section, destroy() { unsubStore(); unsubES(); } };
}
