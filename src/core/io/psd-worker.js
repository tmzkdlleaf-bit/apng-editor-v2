// PSD 파싱 워커(모듈 워커) — ag-psd 로 읽어 레이어 트리를 정규화하고, 각 래스터를 PNG Blob 으로 인코딩한다.
// 메시지: { id, buffer:ArrayBuffer }  → { id, ok, width, height, nodes, warnings } 또는 { id, ok:false, error }
// DOM(document/window) 없음. OffscreenCanvas 로만 캔버스를 다룬다. 네트워크를 쓰지 않는다.
import agPsd, { readPsd } from '../../../vendor/ag-psd/index.js';
import { walkPsd } from './psd.js';

// 워커에는 document 가 없으므로 ag-psd 에 OffscreenCanvas 기반 캔버스 생성기를 주입한다.
agPsd.initializeCanvas(
  (w, h) => new OffscreenCanvas(Math.max(1, w | 0 || 1), Math.max(1, h | 0 || 1)),
  (w, h) => new OffscreenCanvas(1, 1).getContext('2d').createImageData(Math.max(1, w | 0), Math.max(1, h | 0)),
);

// PixelData {width,height,data} → PNG Blob (스트레이트 알파 그대로).
async function encodePng(px) {
  const w = px.width, h = px.height;
  const cv  = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d');
  const src = px.data;
  const clamped = (src instanceof Uint8ClampedArray)
    ? src
    : new Uint8ClampedArray(src.buffer, src.byteOffset, src.byteLength);
  ctx.putImageData(new ImageData(clamped, w, h), 0, 0);
  return await cv.convertToBlob({ type: 'image/png' });
}

self.onmessage = async (e) => {
  const { id, buffer } = e.data || {};
  try {
    const psd = readPsd(buffer, {
      skipCompositeImageData: true,
      useImageData: true,
      skipThumbnail: true,
      throwForMissingFeatures: false,
    });
    if (!psd || !psd.width || !psd.height) throw new Error('유효하지 않은 PSD 파일입니다.');
    const { nodes, warnings } = await walkPsd(psd, encodePng);
    self.postMessage({ id, ok: true, width: psd.width, height: psd.height, nodes, warnings });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
