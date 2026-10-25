// 프로젝트 파일(.apngproj) 내보내기/불러오기 — 다시 편집할 수 있는 원본.
// 파일 = JSON { format, version, doc, assets:{ id:{ meta, data(base64) } } }
// DOM을 쓰지 않는다. 다운로드/업로드(DOM)는 UI 레이어에서 처리한다.
import { getAsset, putAssetById, collectAssetIds } from './assets.js';
import { migrate } from './migrate.js';

export const PROJECT_FORMAT  = 'apng-editor-project';
export const PROJECT_VERSION = 1;
export const LIBRARY_FORMAT  = 'apng-editor-library';
export const LIBRARY_VERSION = 1;

function _abToBase64(ab) {
  const u8 = new Uint8Array(ab);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function _base64ToBlob(b64, type) {
  const bin = atob(b64);
  const u8  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: type || 'application/octet-stream' });
}

// doc + 참조 에셋을 담은 직렬화 객체를 만든다.
export async function buildProjectFile(doc) {
  const ids = collectAssetIds(doc);
  const assets = {};
  for (const id of ids) {
    const blob = await getAsset(id);
    if (!blob) continue; // 바이트가 없으면(있을 수 없지만) 건너뛴다
    const ab   = await blob.arrayBuffer();
    const meta = doc.assets?.[id] ?? { type: blob.type };
    assets[id] = { meta, data: _abToBase64(ab) };
  }
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, doc, assets };
}

// 파일 객체를 읽어 { doc } 반환. 에셋은 id가 같으면 다시 쓰지 않는다.
// 형식/버전이 이상하면 던진다(호출 측에서 알림, 기존 작업은 그대로).
export async function importProjectFile(payload) {
  if (!payload || payload.format !== PROJECT_FORMAT) {
    throw new Error('알 수 없는 프로젝트 파일 형식입니다.');
  }
  const doc = migrate(payload.doc);
  const assets = payload.assets ?? {};
  for (const id of Object.keys(assets)) {
    const entry = assets[id];
    if (!entry?.data) continue;
    const blob = _base64ToBlob(entry.data, entry.meta?.type);
    await putAssetById(id, blob); // 내부에서 중복 검사
  }
  return { doc };
}

// ── 내 부품 파일(.apnglib, R14-3) — 부품 여러 개 + 에셋을 한 파일로. 다른 컴퓨터로 옮길 때. ──
// 파일 = { format, version, parts:[부품 레코드], assets:{ id:{ meta, data(base64) } } }
export async function buildLibraryFile(parts) {
  const assets = {};
  for (const part of parts) {
    for (const id of (part.assetIds ?? [])) {
      if (assets[id]) continue;
      const blob = await getAsset(id);
      if (!blob) continue;
      const ab = await blob.arrayBuffer();
      const meta = part.assets?.[id] ?? { type: blob.type };
      assets[id] = { meta, data: _abToBase64(ab) };
    }
  }
  return { format: LIBRARY_FORMAT, version: LIBRARY_VERSION, parts, assets };
}

// 부품 파일을 읽어 에셋 복원 + { parts } 반환(호출 측이 라이브러리 저장소에 새 id 로 넣는다).
export async function importLibraryFile(payload) {
  if (!payload || payload.format !== LIBRARY_FORMAT) {
    throw new Error('알 수 없는 부품 파일 형식입니다.');
  }
  const assets = payload.assets ?? {};
  for (const id of Object.keys(assets)) {
    const entry = assets[id];
    if (!entry?.data) continue;
    await putAssetById(id, _base64ToBlob(entry.data, entry.meta?.type));
  }
  return { parts: Array.isArray(payload.parts) ? payload.parts : [] };
}
