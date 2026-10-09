// PSD 가져오기(F5-1) — 워커에서 ag-psd 로 파싱 → 레이어/그룹으로 변환, 한 번의 되돌리기로 반영.
// 폴더는 그룹으로, blend/opacity/숨김을 유지한다. 텍스트 레이어는 이미지(래스터)로 가져온다(바꿀 수 있는 기본값).
// 캔버스 크기를 PSD 에 맞출지 먼저 묻는다.
import { createLayer } from '../core/doc/schema.js';
import { putAsset } from '../core/io/assets.js';
import { showToast } from './shell/status.js';

let _seq = 0;

// 워커로 PSD 를 파싱한다. { width, height, nodes, warnings } 반환.
function parseInWorker(buffer) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../core/io/psd-worker.js', import.meta.url), { type: 'module' });
    } catch (err) { reject(err); return; }
    const id = ++_seq;
    const done = (fn, arg) => { try { worker.terminate(); } catch {} fn(arg); };
    worker.onmessage = (e) => {
      const m = e.data;
      if (!m || m.id !== id) return;
      if (m.ok) done(resolve, m);
      else done(reject, new Error(m.error || 'PSD 파싱 실패'));
    };
    worker.onerror = (e) => done(reject, new Error(e.message || 'PSD 워커 오류'));
    worker.postMessage({ id, buffer }, [buffer]);
  });
}

// 정규화 트리(nodes)를 명령 묶음으로 변환한다.
// PSD children[0] = 최상위 → 우리 order 는 뒤가 위이므로 역순으로 추가해 쌓임 순서를 맞춘다.
// 반환: { cmds, count }
async function buildCommands(nodes, doc) {
  const cmds = [];
  const assetSeen = new Set(Object.keys(doc.assets ?? {}));
  let count = 0;

  async function emit(list, parentId) {
    // 역순: 리스트의 마지막(PSD 바닥) 먼저 추가 → order 앞쪽(아래)에 오게
    for (let i = list.length - 1; i >= 0; i--) {
      const node = list[i];
      if (node.kind === 'group') {
        const g = createLayer('group', {
          name: node.name, childOrder: [],
          blend: node.blend, opacity: node.opacity, visible: !node.hidden,
        });
        cmds.push({ type: 'addLayer', layer: g, parentId: parentId ?? null });
        await emit(node.children, g.id);
      } else {
        const name = node.name;
        const { id: assetId, meta } = await putAsset(node.data, name);
        if (!meta.width || !meta.height) continue;
        const layer = createLayer('image', {
          name, assetId,
          blend: node.blend, opacity: node.opacity, visible: !node.hidden,
        });
        layer.transform.x.value = Math.round(node.left + node.w / 2);
        layer.transform.y.value = Math.round(node.top  + node.h / 2);
        if (!assetSeen.has(assetId)) { assetSeen.add(assetId); cmds.push({ type: 'addAsset', id: assetId, asset: meta }); }
        cmds.push({ type: 'addLayer', layer, parentId: parentId ?? null });
        count++;
      }
    }
  }

  await emit(nodes, null);
  return { cmds, count };
}

function _defaultConfirmResize(w, h) {
  return typeof confirm === 'function'
    ? confirm(`캔버스 크기를 PSD 크기(${w}×${h})에 맞출까요?`)
    : true;
}

// 메인 진입점. file: PSD File/Blob. opts.confirmResize(w,h)->bool 주입 가능(테스트용).
export async function importPsdFile(file, store, editorState, opts = {}) {
  const confirmResize = opts.confirmResize ?? _defaultConfirmResize;
  let res;
  try {
    const buffer = await file.arrayBuffer();
    res = await parseInWorker(buffer);
  } catch (err) {
    showToast('PSD 를 불러올 수 없습니다: ' + (err?.message ?? '형식 오류'));
    return { ok: false };
  }

  const doc = store.get();
  const { cmds, count } = await buildCommands(res.nodes, doc);
  if (!count) { showToast('가져올 레이어가 없습니다.'); return { ok: false }; }

  // 캔버스 크기를 PSD 에 맞출지 먼저 묻는다.
  const needResize = (res.width !== doc.meta.width || res.height !== doc.meta.height);
  const doResize = needResize ? !!confirmResize(res.width, res.height) : false;
  if (doResize) cmds.unshift({ type: 'resizeCanvas', width: res.width, height: res.height });

  store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  editorState?.set?.({ selection: [] });

  // 경고 요약(지원 안 하는 블렌드·텍스트 래스터화)
  const w = res.warnings || {};
  const parts = [`레이어 ${count}개를 가져왔습니다.`];
  if (w.textLayers)              parts.push(`텍스트 ${w.textLayers}개는 이미지로 변환했습니다.`);
  if (w.unsupportedBlends?.length) parts.push(`지원하지 않는 블렌드(${w.unsupportedBlends.join(', ')})는 기본으로 두었습니다.`);
  showToast(parts.join(' '));
  return { ok: true, count, warnings: w, resized: doResize };
}
