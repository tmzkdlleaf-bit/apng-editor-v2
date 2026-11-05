export function createEditorState(initial = {}) {
  let _s = {
    selection: [],
    f: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    grid: false,
    gridStep: 32,       // F2-9: 그리드 간격(px) 8·16·32·64·128
    snap: true,
    autoKey: false,
    groupEdit: null,
    tool: 'select',
    playing: false,
    loopMode: 'loop',   // 'loop' | 'once' | 'pingpong'
    playDir: 1,
    // P6 보완2
    kfSelection: [],    // 선택된 키프레임 참조 [{ id, path, f }]
    expanded: {},       // 타임라인 레이어 펼침 상태 { layerId: true }
    focusRegion: 'canvas', // 'canvas' | 'timeline' — 복사/삭제 대상 결정
    tlSnap: true,       // item 7: 타임라인 머리줄 스냅 (키·클립 → 프레임·재생선·다른 키)
    cameraActive: false, // F2-6: 카메라 행 선택(인스펙터 카메라 섹션·캔버스 영역 표시)
    // R12-2 앞뒤 프레임 겹쳐 보기(미리보기 전용 — 내보내기에는 안 들어감). 문서에 저장하지 않는다.
    onion: false,
    onionBefore: 1,     // 앞(이전) 프레임 수 0~3
    onionAfter: 1,      // 뒤(다음) 프레임 수 0~3
    // R13-1 세트 변형 미리보기(문서는 안 바꾸고 렌더에만 적용). null 이면 원본 그대로.
    previewVariantId: null,
    // R19 그래프 편집기(트랙 자리에 겹침). graphView: 'value'(값) | 'speed'(속도).
    graphMode: false,
    graphView: 'value',
    // R21b 가리기 그리는 중 미리보기(문서 미변경). { layerId, path, cursor? } 또는 null.
    maskDraft: null,
    // R23c 미리보기 해상도(미리보기 전용 — 내보내기에는 영향 없음). 'full'|'half'|'quarter'|'auto'.
    //   'auto' = 지금 자동 절반 해상도 규칙(드래그·재생 중만 낮춤). 문서에 저장하지 않는다.
    previewRes: 'auto',
    // R23c 화면 아래 줄 토글(미리보기 전용). 투명 격자는 기본 켜짐(지금 늘 보이던 체커).
    checker: true,
    guides: false,
    safeArea: false,
  };

  for (const k of Object.keys(initial)) {
    if (k in _s) _s[k] = initial[k];
  }
  if (!Array.isArray(_s.selection)) _s.selection = [];
  if (!Array.isArray(_s.kfSelection)) _s.kfSelection = [];

  const _subs = [];

  function get() { return _s; }

  // 키프레임 선택 비교 (내용 기준)
  function _kfEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].path !== b[i].path || a[i].f !== b[i].f) return false;
    }
    return true;
  }

  function set(patch) {
    const next = { ..._s };
    let dirty = false;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (k === 'selection') {
        const arrNew = Array.isArray(v) ? v : [];
        const arrOld = _s.selection;
        if (arrOld.length !== arrNew.length || arrOld.some((x, i) => x !== arrNew[i])) {
          next.selection = arrNew.slice();
          dirty = true;
        }
      } else if (k === 'kfSelection') {
        const arrNew = Array.isArray(v) ? v : [];
        if (!_kfEqual(_s.kfSelection, arrNew)) {
          next.kfSelection = arrNew.slice();
          dirty = true;
        }
      } else if (k === 'expanded') {
        // 객체 — 항상 교체 (호출 측이 새 객체 전달)
        next.expanded = { ...(v ?? {}) };
        dirty = true;
      } else if (_s[k] !== v) {
        next[k] = v;
        dirty = true;
      }
    }
    if (dirty) {
      _s = next;
      for (const fn of _subs) fn(patch);
    }
  }

  function subscribe(fn) {
    _subs.push(fn);
    return () => {
      const i = _subs.indexOf(fn);
      if (i !== -1) _subs.splice(i, 1);
    };
  }

  return { get, set, subscribe };
}
