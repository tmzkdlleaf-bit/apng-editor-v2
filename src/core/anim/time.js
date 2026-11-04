// R22b — 그룹 시간. 바깥(최상위) 프레임 → 그룹 안쪽 프레임 변환을 한 곳에서 한다. DOM 없음.
//   group.time = { offset, speed, outside:'hold'|'loop'|'hide', length|null, remap|null }
//   time 이 없으면(null) 모든 함수가 입력 프레임을 그대로 돌려준다 → 기존 렌더 경로와 픽셀 동일.
import { evalProp } from './prop.js';

// 그룹 안쪽 길이(length=null 이면 문서 frameCount).
function _innerLength(time, frameCount) {
  const len = time.length;
  return (len == null) ? (frameCount ?? 0) : len;
}

// 시간 다시 매기기(remap)가 실제로 켜져 있는가.
function _hasRemap(time) {
  return !!(time && time.remap && Array.isArray(time.remap.keys) && time.remap.keys.length);
}

// 변환 전 '날' 안쪽 프레임((f−offset)×speed). 범위 처리 전 값.
function _rawInner(time, f) {
  const offset = time.offset ?? 0;
  const speed  = time.speed  ?? 1;
  return (f - offset) * speed;
}

// 바깥 프레임 f → 이 그룹 '안쪽' 프레임. 소수일 수 있다(움직이는 이미지는 호출 측에서 내림).
export function innerFrame(layer, f, frameCount) {
  const t = layer?.time;
  if (!t) return f;
  if (_hasRemap(t)) return evalProp(t.remap, f);   // remap 이 있으면 offset/speed/범위 무시

  const raw = _rawInner(t, f);
  const len = _innerLength(t, frameCount);
  if (!(len > 0)) return raw;
  if (raw >= 0 && raw <= len) return raw;

  const outside = t.outside ?? 'hold';
  if (outside === 'loop') return ((raw % len) + len) % len;
  // hold·hide: 변형 계산에는 끝값(클램프)을 쓴다. hide 의 '안 보임'은 groupHidden 이 따로 알린다.
  return raw < 0 ? 0 : len;
}

// outside='hide' 이고 안쪽 길이 밖이면 true(그룹을 그리지 않는다). remap 은 항상 보인다.
export function groupHidden(layer, f, frameCount) {
  const t = layer?.time;
  if (!t || (t.outside ?? 'hold') !== 'hide' || _hasRemap(t)) return false;
  const raw = _rawInner(t, f);
  const len = _innerLength(t, frameCount);
  if (!(len > 0)) return false;
  return raw < 0 || raw > len;
}

// 레이어의 조상(부모 체인) id 목록 — root 가 먼저, 자기 자신은 제외.
function _ancestors(doc, id) {
  const chain = [];
  const self = doc?.layers?.[id];
  if (!self) return chain;
  let pid = self.parentId;
  const seen = new Set();
  while (pid && doc.layers[pid] && !seen.has(pid)) {
    seen.add(pid);
    chain.unshift(pid);
    pid = doc.layers[pid].parentId;
  }
  return chain;
}

// 이 레이어의 '안쪽 로컬' 프레임 — 조상 그룹 시간을 root→부모 순으로 모두 적용한 결과.
//   현재 프레임에 키를 넣는 모든 편집은 이 프레임을 써야 한다(editorState.f 는 항상 바깥 프레임).
export function localFrame(doc, id, f) {
  const fc = doc?.meta?.frameCount;
  let cur = f;
  for (const aid of _ancestors(doc, id)) {
    const anc = doc.layers[aid];
    if (anc?.time) cur = innerFrame(anc, cur, fc);
  }
  return cur;
}

// 안쪽 로컬 프레임 → 바깥 프레임(역변환). 타임라인에서 그룹 안 키를 바깥 위치로 그릴 때.
//   offset/speed 는 역으로 푼다. remap 은 역함수가 없어 그대로 둔다(그 줄은 끌 수 없게 그린다).
export function outerFrame(doc, id, localF) {
  const anc = _ancestors(doc, id);          // root..부모
  let cur = localF;
  for (let i = anc.length - 1; i >= 0; i--) { // 안쪽(부모)부터 바깥(root)으로 역순
    const t = doc.layers[anc[i]]?.time;
    if (!t || _hasRemap(t)) continue;
    const offset = t.offset ?? 0;
    const speed  = t.speed  ?? 1;
    cur = offset + (speed === 0 ? 0 : cur / speed);
  }
  return cur;
}

// 조상 중 시간이 켜진 그룹이 하나라도 있는가(없으면 기존 경로 그대로 — 빠른 판정).
export function hasTimedAncestor(doc, id) {
  for (const aid of _ancestors(doc, id)) {
    if (doc.layers[aid]?.time) return true;
  }
  return false;
}

// 바깥 1프레임이 이 레이어 안쪽 몇 프레임에 해당하는지(조상 speed 의 곱). 타임라인 끌기 환산용.
export function localSpeed(doc, id) {
  let s = 1;
  for (const aid of _ancestors(doc, id)) {
    const t = doc.layers[aid]?.time;
    if (t && !_hasRemap(t)) s *= (t.speed ?? 1);
  }
  return s;
}
