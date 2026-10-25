// 저장 시점(snapshots) 정책 — 순수 함수(DOM 없음). 실제 저장은 idb.js, 배선은 app.js.
// 레코드: { id, projectId, createdAt, label, doc, thumb?, auto, bytes }
//   auto=true  자동 저장 중 남긴 시점(규칙에 따라 오래된 것부터 지움)
//   auto=false 직접 남긴 시점(자동으로 지우지 않음)

const DAY_MS = 24 * 60 * 60 * 1000;

export const SNAPSHOT_DEFAULTS = {
  minIntervalMs: 5 * 60 * 1000, // 자동 시점 최소 간격(마지막 시점에서 이만큼 지나야)
  maxCount: 30,                 // 프로젝트당 최근 자동 시점 수
  dailyDays: 7,                 // 하루에 1개씩 남길 최근 일수
  maxBytes: 50 * 1024 * 1024,   // 프로젝트당 문서 JSON 합계 상한
};

// 문서 JSON 대략 크기(바이트). 썸네일/blob 은 세지 않는다(assets 는 공유 저장).
export function snapshotBytes(doc) {
  try { return JSON.stringify(doc).length; } catch { return 0; }
}

function _snapId() {
  try { return 'snap_' + crypto.randomUUID(); } catch { return 'snap_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

// 자동 시점을 남길 때인가 — 마지막 시점 시각(lastAt)에서 minIntervalMs 이상 지났고 문서가 바뀌었을 때.
export function shouldAutoSnapshot({ lastAt = 0, now = Date.now(), changed = true, minIntervalMs = SNAPSHOT_DEFAULTS.minIntervalMs } = {}) {
  if (!changed) return false;
  return (now - lastAt) >= minIntervalMs;
}

// 시점 레코드 만들기.
export function makeSnapshot({ projectId, doc, label = '', thumb = null, auto = true, now = Date.now(), id = null }) {
  const rec = {
    id: id ?? _snapId(),
    projectId,
    createdAt: now,
    label: label || '',
    doc,
    auto: !!auto,
    bytes: snapshotBytes(doc),
  };
  if (thumb != null) rec.thumb = thumb;
  return rec;
}

// 보관 정책 적용 — 지울 시점 id 목록을 돌려준다(한 프로젝트의 시점 목록을 받음).
//   직접 남긴 시점(auto=false)은 절대 지우지 않는다.
//   자동 시점: 최근 maxCount개 + 최근 dailyDays일의 하루당 1개(그날 가장 최근)를 남기고 나머지는 지운다.
//   그래도 전체(수동 포함) 바이트 합이 maxBytes를 넘으면 남은 자동 시점 중 오래된 것부터 더 지운다.
export function pruneSnapshots(list, opts = {}) {
  const { maxCount, dailyDays, maxBytes } = { ...SNAPSHOT_DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();
  const desc = [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const keep = new Set();
  const autosDesc = [];
  for (const s of desc) {
    if (!s.auto) keep.add(s.id);   // 수동은 항상 보관
    else autosDesc.push(s);
  }
  // 최근 maxCount개
  for (let i = 0; i < Math.min(maxCount, autosDesc.length); i++) keep.add(autosDesc[i].id);
  // 최근 dailyDays일 하루당 1개(그날 가장 최근 — desc 순서상 먼저 만나는 것)
  const today = Math.floor(now / DAY_MS);
  const seenDay = new Set();
  for (const s of autosDesc) {
    const dk = Math.floor((s.createdAt ?? 0) / DAY_MS);
    const age = today - dk;
    if (age < 0 || age >= dailyDays) continue;
    if (!seenDay.has(dk)) { seenDay.add(dk); keep.add(s.id); }
  }

  // 바이트 예산 — 넘치면 보관 중인 자동 시점을 오래된 것부터 뺀다(수동은 유지).
  let total = 0;
  for (const s of desc) if (keep.has(s.id)) total += (s.bytes ?? 0);
  if (total > maxBytes) {
    const keptAutosAsc = desc.filter((s) => s.auto && keep.has(s.id)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    for (const s of keptAutosAsc) {
      if (total <= maxBytes) break;
      keep.delete(s.id);
      total -= (s.bytes ?? 0);
    }
  }

  const removeIds = desc.filter((s) => !keep.has(s.id)).map((s) => s.id);
  return { keepIds: [...keep], removeIds };
}
