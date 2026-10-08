// 움직임 섹션(F3-2) — 모션 추가(갤러리) · 클립 목록 · 선택 클립 편집.
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { openMotionGallery } from '../motion-gallery.js';
import { createClip } from '../../core/doc/schema.js';
import { getMotion } from '../../motions/registry.js';
import { defaultParams } from '../../motions/contract.js';
import { EASE_LABELS } from '../../core/anim/easing.js';
import { showToast } from '../shell/status.js';
import { straightenPath } from '../canvas/path-edit.js';
import { motionPathKeyFrames } from '../canvas/gizmo.js';

// 모션이 바꾸는 transform 속성(x/y/scale/rotation/alpha)을 샘플로 알아낸다(덮어쓰기 확인용).
function _affectedProps(motion) {
  const p = defaultParams(motion);
  const set = new Set();
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const d = motion.evaluate(t, p) ?? {};
    if ((d.x ?? 0) !== 0) set.add('x');
    if ((d.y ?? 0) !== 0) set.add('y');
    if ((d.scale ?? 1) !== 1) set.add('scale');
    if ((d.rotation ?? 0) !== 0) set.add('rotation');
    if ((d.alpha ?? 1) !== 1) set.add('alpha');
  }
  return set;
}

export function createMotionSection(store, editorState) {
  const { section, body } = makeSectionShell('움직임', false);
  let _selectedClip = null; // clipId (단일 레이어 기준)
  let _knobFields = [];

  const ids = () => editorState.get().selection.filter((id) => store.get().layers[id]);
  const fps = () => store.get().meta.fps || 12;

  // ── 모션 추가 ────────────────────────────────────────────────────────
  const addBtn = document.createElement('button');
  addBtn.className = 'accent sm'; addBtn.textContent = '+ 모션 추가';
  addBtn.addEventListener('click', () => {
    if (!ids().length) { showToast('레이어를 선택하세요.'); return; }
    openMotionGallery(addBtn, { onPick: (m) => _applyMotion(m) });
  });
  body.appendChild(addBtn);

  // 경로 직선화(F3-4) — 단일 레이어에 경로 키가 3개 이상일 때
  const straightenBtn = document.createElement('button');
  straightenBtn.className = 'quiet sm'; straightenBtn.textContent = '경로 직선화';
  straightenBtn.style.marginLeft = 'var(--sp-2)';
  straightenBtn.addEventListener('click', () => { const l = ids(); if (l.length === 1) { straightenPath(store, l[0]); } });
  body.appendChild(straightenBtn);

  // 클립 목록
  const listWrap = document.createElement('div'); listWrap.className = 'motion-clip-list';
  body.appendChild(listWrap);

  // 선택 클립 편집
  const editWrap = document.createElement('div'); editWrap.className = 'motion-clip-edit';
  body.appendChild(editWrap);

  function _applyMotion(motion) {
    const list = ids();
    const f = editorState.get().f;
    // 덮어쓰기 확인: 키 있는 속성에 영향 주는 모션이면 확인
    const affected = _affectedProps(motion);
    const doc = store.get();
    const hasKeyConflict = list.some((id) => {
      const tr = doc.layers[id].transform;
      return [...affected].some((k) => (tr[k]?.keys ?? []).length > 0);
    });
    if (hasKeyConflict && typeof confirm === 'function') {
      if (!confirm('이 속성에 키프레임이 있습니다. 모션을 더할까요?')) return; // 취소 시 변화 없음
    }
    const cmds = list.map((id) => ({
      type: 'addClip', id,
      clip: createClip(motion, { start: f, length: motion.defaultLength }),
    }));
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    // 첫 레이어의 마지막 클립 선택
    const first = store.get().layers[list[0]];
    _selectedClip = first.clips[first.clips.length - 1]?.id ?? null;
    _refresh();
  }

  function _layerClips() {
    const list = ids();
    if (list.length !== 1) return { id: null, clips: [] };
    return { id: list[0], clips: store.get().layers[list[0]].clips ?? [] };
  }

  function _renderList() {
    listWrap.textContent = '';
    const { id, clips } = _layerClips();
    if (!id) { listWrap.textContent = ids().length > 1 ? '여러 레이어 — 모션은 모두에 적용됩니다.' : ''; return; }
    for (const clip of clips) {
      const mot = getMotion(clip.motionId);
      const row = document.createElement('div');
      row.className = 'motion-clip-row' + (clip.id === _selectedClip ? ' is-sel' : '');
      const name = document.createElement('span'); name.className = 'mc-name';
      name.textContent = (clip.loop ? '↻ ' : '') + (mot?.name ?? clip.motionId);
      const info = document.createElement('span'); info.className = 'mc-info';
      info.textContent = `${clip.start}f · ${clip.length}f`;
      const del = document.createElement('button'); del.className = 'mc-del'; del.textContent = '×'; del.title = '삭제';
      del.addEventListener('click', (e) => { e.stopPropagation(); store.apply({ type: 'removeClip', id, clipId: clip.id }); if (_selectedClip === clip.id) _selectedClip = null; _refresh(); });
      row.append(name, info, del);
      row.addEventListener('click', () => { _selectedClip = clip.id; _refresh(); });
      listWrap.appendChild(row);
    }
  }

  function _renderEdit() {
    for (const f of _knobFields) f.destroy?.();
    _knobFields = [];
    editWrap.textContent = '';
    const { id, clips } = _layerClips();
    const clip = clips.find((c) => c.id === _selectedClip);
    if (!id || !clip) { editWrap.style.display = 'none'; return; }
    editWrap.style.display = '';
    const mot = getMotion(clip.motionId);

    const setClip = (patch, preview) => {
      const cmd = { type: 'setClip', id, clipId: clip.id, patch };
      if (preview) store.preview(cmd); else store.apply(cmd);
    };

    // 시작·길이(프레임) + 초 표시
    _sub(editWrap, '구간');
    const startF = createNumberField({
      label: '시작', min: 0, max: 9999, step: 1, unit: 'f', defaultValue: 0,
      onBegin() { store.begin('클립 시작'); }, onChange(v) { setClip({ start: Math.round(v) }, true); },
      onCommit() { store.commit(); _renderList(); }, onCancel() { store.cancel(); },
    });
    startF.setValue(clip.start);
    const lenF = createNumberField({
      label: '길이', min: 1, max: 9999, step: 1, unit: 'f', defaultValue: 12,
      onBegin() { store.begin('클립 길이'); }, onChange(v) { setClip({ length: Math.max(1, Math.round(v)) }, true); },
      onCommit() { store.commit(); _renderList(); }, onCancel() { store.cancel(); },
    });
    lenF.setValue(clip.length);
    _row2(editWrap, startF.el, lenF.el);
    _knobFields.push(startF, lenF);
    const secNote = document.createElement('div'); secNote.className = 'info-note';
    secNote.textContent = `≈ 시작 ${(clip.start / fps()).toFixed(2)}초 · 길이 ${(clip.length / fps()).toFixed(2)}초`;
    editWrap.appendChild(secNote);

    // 속도 5단계 · 진폭 5단계
    _sub(editWrap, '세기');
    const speeds = [0.5, 0.75, 1, 1.5, 2];
    const amps = [0.5, 0.75, 1, 1.5, 2];
    editWrap.appendChild(_steps('속도', speeds, Math.round(clip.length / (mot?.defaultLength ?? clip.length) * 100) / 100, (mul) => {
      store.apply({ type: 'setClip', id, clipId: clip.id, patch: { length: Math.max(1, Math.round((mot?.defaultLength ?? clip.length) * (1 / mul))) } });
      _renderList();
    }));
    editWrap.appendChild(_steps('진폭', amps, clip.gain ?? 1, (g) => { store.apply({ type: 'setClip', id, clipId: clip.id, patch: { gain: g } }); }));

    // 이징 일괄
    const easeDd = createDropdown({
      ariaLabel: '클립 이징', value: clip.ease ?? 'linear',
      options: [{ value: 'linear', label: '없음(일정)' }, ...Object.entries(EASE_LABELS).filter(([k]) => k !== 'cubicBezier').map(([value, label]) => ({ value, label }))],
      onChange: (v) => store.apply({ type: 'setClip', id, clipId: clip.id, patch: { ease: v === 'linear' ? null : v } }),
    });
    editWrap.appendChild(_rowLabel('이징', easeDd.el));
    _knobFields.push({ destroy: () => easeDd.destroy() });

    // 프리셋 노브(파라미터)
    if (mot?.params?.length) {
      _sub(editWrap, '세부');
      for (const pd of mot.params) {
        const f = createNumberField({
          label: pd.label, min: pd.min, max: pd.max, step: pd.step, defaultValue: pd.default,
          onBegin() { store.begin('모션 파라미터'); },
          onChange(v) { setClip({ params: { ...clip.params, [pd.key]: v } }, true); },
          onCommit() { store.commit(); }, onCancel() { store.cancel(); },
        });
        f.setValue(clip.params?.[pd.key] ?? pd.default);
        const r = document.createElement('div'); r.className = 'prop-row'; r.appendChild(f.el); editWrap.appendChild(r);
        _knobFields.push(f);
      }
    }

    // 다시 적용 — 현재 프레임부터 기본 길이로 같은 모션 재적용
    const reapply = document.createElement('button');
    reapply.className = 'quiet sm'; reapply.textContent = '현재 프레임에 다시 적용';
    reapply.addEventListener('click', () => { if (mot) _applyMotion(mot); });
    editWrap.appendChild(reapply);
  }

  function _refresh() {
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    // 경로 직선화 버튼 — 단일 레이어·경로 키 3개 이상
    const canStraighten = list.length === 1 && motionPathKeyFrames(store.get().layers[list[0]]).length >= 3;
    straightenBtn.style.display = canStraighten ? '' : 'none';
    // 선택 클립이 사라졌으면 해제
    const { clips } = _layerClips();
    if (_selectedClip && !clips.some((c) => c.id === _selectedClip)) _selectedClip = null;
    _renderList();
    _renderEdit();
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES = editorState.subscribe((p) => { if ('selection' in p) { _selectedClip = null; _refresh(); } });
  _refresh();

  function destroy() { unsubStore(); unsubES(); for (const f of _knobFields) f.destroy?.(); }
  return { el: section, destroy };
}

// ── 소형 헬퍼 ──────────────────────────────────────────────────────────
function _sub(parent, text) { const d = document.createElement('div'); d.className = 'adj-subtitle'; d.textContent = text; parent.appendChild(d); }
function _row2(parent, a, b) { const r = document.createElement('div'); r.className = 'prop-row-2'; r.append(a, b); parent.appendChild(r); }
function _rowLabel(label, ctrl) { const r = document.createElement('div'); r.className = 'prop-row'; const l = document.createElement('label'); l.className = 'num-label'; l.textContent = label; r.append(l, ctrl); return r; }
function _steps(label, values, current, onPick) {
  const r = document.createElement('div'); r.className = 'prop-row motion-steps';
  const l = document.createElement('label'); l.className = 'num-label'; l.textContent = label; r.appendChild(l);
  const grp = document.createElement('div'); grp.className = 'motion-step-grp';
  for (const v of values) {
    const b = document.createElement('button'); b.className = 'motion-step' + (Math.abs(v - current) < 0.01 ? ' is-on' : '');
    b.textContent = v + '×';
    b.addEventListener('click', () => onPick(v));
    grp.appendChild(b);
  }
  r.appendChild(grp); return r;
}
