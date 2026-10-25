// 에셋 저장소 — 내용 주소 방식(SHA-256). 같은 파일은 한 번만 저장한다.
// 바이트는 IndexedDB assets 저장소(Blob). doc.assets[id]에는 메타만 둔다.
// DOM을 쓰지 않는다(crypto.subtle, createImageBitmap은 워커에도 있다).
import {
  getAssetBlob, putAssetBlob, hasAssetBlob, deleteAssetBlob, allAssetIds, listProjects, getAssetSavedAt,
  listAllSnapshots, listLibraryParts,
} from './idb.js';
import { variantAssetIds } from '../doc/variants.js';

// 파일 바이트의 SHA-256 앞 16자(8바이트) → 'ast_' 접두어
export async function hashAssetId(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes  = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return 'ast_' + hex;
}

async function _dimensions(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const dim = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return dim;
  } catch {
    return { width: 0, height: 0 };
  }
}

// 파일/Blob을 저장하고 { id, meta } 반환. 같은 내용이면 바이트 쓰기는 건너뛴다.
export async function putAsset(file, nameHint) {
  const buffer = await file.arrayBuffer();
  const id     = await hashAssetId(buffer);
  const type   = file.type || 'image/png';
  const { width, height } = await _dimensions(file);
  const name = nameHint
    ?? (file.name ? String(file.name).replace(/\.[^.]+$/, '') : '이미지');
  const meta = { name, type, width, height, bytes: buffer.byteLength };
  if (!(await hasAssetBlob(id))) {
    const blob = (file instanceof Blob) ? file : new Blob([buffer], { type });
    await putAssetBlob(id, blob);
  }
  return { id, meta };
}

// 특정 id로 Blob 저장(불러오기 경로). 이미 있으면 건너뛴다.
export async function putAssetById(id, blob) {
  if (!(await hasAssetBlob(id))) await putAssetBlob(id, blob);
}

export async function getAsset(id) { return getAssetBlob(id); }

// 문서가 참조하는 에셋 id 전부 모으기 (레이어 assetId / 효과 sources / 마스크 소스)
export function collectAssetIds(doc, set = new Set()) {
  if (!doc?.layers) return set;
  for (const id of Object.keys(doc.layers)) {
    const l = doc.layers[id];
    if (!l) continue;
    if (l.assetId) set.add(l.assetId);
    if (Array.isArray(l.sources)) {
      for (const s of l.sources) {
        if (typeof s === 'string') set.add(s);
        else if (s?.assetId) set.add(s.assetId);
      }
    }
    if (l.mask?.assetId) set.add(l.mask.assetId);
  }
  // 세트(바리에이션) 이미지 슬롯이 가리키는 에셋도 "사용 중"으로 센다(R13-1, 정리에서 지우지 않게).
  variantAssetIds(doc.variants, set);
  return set;
}

// 어떤 프로젝트도 가리키지 않는 에셋 Blob을 지운다. 앱 시작 때만 부른다(그때는 되돌리기 기록이 없다).
// 최근(maxAgeMs 이내)에 저장된 고아는 남긴다 — 열려 있는 문서의 되돌리기, 아직 저장 안 된 변경,
// 다른 탭이 방금 넣은 이미지를 지우지 않기 위해서다(R7-3).
export async function purgeOrphanAssets({ maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now(), keepIds = [] } = {}) {
  const projects = await listProjects();
  const used = new Set();
  for (const p of projects) collectAssetIds(p.doc, used);
  // 호출 측이 지켜 달라고 넘긴 id(코코포리아 미리보기 배경 등, R14-2) — 어떤 문서도 안 쓰지만 보존.
  for (const id of keepIds) if (id) used.add(id);
  // 저장 시점(snapshots)이 가리키는 이미지도 "사용 중"으로 센다 — 되돌렸을 때 이미지가 비지 않게(R12-3, R7-3).
  try {
    const snaps = await listAllSnapshots();
    for (const s of (snaps ?? [])) collectAssetIds(s.doc, used);
  } catch { /* 구버전 DB 등 — 무시 */ }
  // 내 부품(library)이 쓰는 이미지도 "사용 중"으로 센다 — 부품 넣었을 때 이미지가 비지 않게(R14-3).
  try {
    const parts = await listLibraryParts();
    for (const p of (parts ?? [])) for (const aid of (p.assetIds ?? [])) if (aid) used.add(aid);
  } catch { /* 구버전 DB 등 — 무시 */ }
  const all = await allAssetIds();
  for (const id of all) {
    if (used.has(id)) continue;
    const savedAt = await getAssetSavedAt(id);
    if (now - savedAt < maxAgeMs) continue; // 최근 저장 — 보호
    await deleteAssetBlob(id);
  }
}
