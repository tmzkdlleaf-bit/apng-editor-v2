// 용도 프리셋 — 형식·크기 제한·목표 용량의 모든 수치를 이 파일에만 둔다.
// 규칙이 바뀌면 여기만 고친다. 각 항목에 source(출처 한 줄)와 checked(확인 날짜).
//
// 프리셋 필드:
//   id, name, format('apng'|'webp'|'gif')
//   maxWidth?, maxHeight?  크기 제한(이 안에 맞춘 크기를 "크기 1"로 본다)
//   trim?                  투명 여백 잘라내기
//   targetBytes?           목표 용량(이하). 없으면 줄이지 않고 최고 화질로 1회.
//   colors?                APNG 기본 색 수(0=무손실). fit이 목표에 맞춰 조정할 수 있다.
//   source, checked

export const DEFAULT_PRESETS = [
  {
    id: 'ccfolia-apng', name: '코코포리아 (APNG)', format: 'apng',
    targetBytes: 1_000_000,
    source: '코코포리아 2025-08 공지: 1MB 초과 이미지는 서버에서 압축 → APNG 애니메이션이 멈출 수 있음',
    checked: '2026-10-06',
  },
  {
    id: 'ccfolia-webp', name: '코코포리아 (WebP)', format: 'webp',
    targetBytes: 1_000_000,
    source: '코코포리아 용량 규칙(APNG와 동일한 1MB 기준). 같은 화질에서 보통 APNG보다 작다',
    checked: '2026-10-06',
  },
  {
    id: 'discord-sticker', name: '디스코드 스티커', format: 'apng',
    maxWidth: 320, maxHeight: 320, trim: true, targetBytes: 512_000,
    source: '디스코드 스티커: 320×320, 512KB, 애니메이션은 APNG만(제3자 안내 기준)',
    checked: '2026-10-06',
  },
  {
    id: 'discord-emoji', name: '디스코드 이모지', format: 'gif',
    maxWidth: 128, maxHeight: 128, targetBytes: 256_000,
    source: '디스코드 이모지: 128×128, 256KB, GIF(제3자 안내 기준)',
    checked: '2026-10-06',
  },
  {
    id: 'gif-any', name: '범용 GIF', format: 'gif',
    source: '범용 GIF — 색 256·투명 1비트, 어디서나 재생',
    checked: '2026-10-06',
  },
  {
    id: 'archive', name: '고화질 보관', format: 'apng', colors: 0,
    source: '무손실 APNG — 원본 화질 보관용',
    checked: '2026-10-06',
  },
];

const USER_KEY   = 'apng2.userPresets';
const LAST_KEY   = 'apng2.lastPreset'; // 프로젝트별: `${LAST_KEY}.${projectId}`

function _read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function _write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export function getUserPresets() {
  const arr = _read(USER_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

// 기본 + 사용자 프리셋
export function getPresets() {
  return [...DEFAULT_PRESETS, ...getUserPresets()];
}

export function getPreset(id) {
  return getPresets().find((p) => p.id === id) ?? null;
}

export function isDefaultPreset(id) {
  return DEFAULT_PRESETS.some((p) => p.id === id);
}

// 사용자 프리셋 저장(없으면 id 생성, 있으면 교체). 기본 id와 겹치면 거부.
export function saveUserPreset(preset) {
  if (isDefaultPreset(preset.id)) throw new Error('기본 프리셋 id는 쓸 수 없습니다.');
  const id = preset.id || ('user-' + Date.now().toString(36));
  const rec = { ...preset, id, checked: preset.checked ?? null, source: preset.source ?? '사용자 프리셋' };
  const user = getUserPresets().filter((p) => p.id !== id);
  user.push(rec);
  _write(USER_KEY, user);
  return rec;
}

// 사용자 프리셋만 삭제 가능. 기본 프리셋은 지울 수 없다.
export function deleteUserPreset(id) {
  if (isDefaultPreset(id)) return false;
  const user = getUserPresets().filter((p) => p.id !== id);
  _write(USER_KEY, user);
  return true;
}

// 마지막으로 쓴 용도를 프로젝트별로 기억
export function getLastPresetId(projectId) {
  if (!projectId) return null;
  try { return localStorage.getItem(`${LAST_KEY}.${projectId}`); } catch { return null; }
}
export function setLastPresetId(projectId, presetId) {
  if (!projectId) return;
  try { localStorage.setItem(`${LAST_KEY}.${projectId}`, presetId); } catch {}
}
