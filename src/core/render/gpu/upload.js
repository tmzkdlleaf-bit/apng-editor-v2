// 2D 캔버스 ↔ 텍스처 주고받기(R34a). 주고받는 횟수를 센다(성능 보고용 — 왕복이 병목인지 본다).
//   업로드/읽기 모두 straight alpha(UNPACK_PREMULTIPLY_ALPHA=false)로 2D 캔버스(getImageData)와 같은 전제.
//   세로 방향: 업로드 때 FLIP_Y 로 뒤집어 넣고, 읽을 때 한 번 더 뒤집어 돌려받는다 → 왕복하면 원래 방향.

export function createUploader(gl) {
  let _uploads = 0;
  let _downloads = 0;

  // 2D 캔버스(또는 ImageBitmap 등)를 기존 텍스처에 올린다. 텍스처는 풀에서 빌린 것.
  function uploadInto(tex, source) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    _uploads++;
  }

  // 지금 FBO 에 붙어 있는 텍스처(w×h)를 2D 캔버스에 담아 돌려준다. 캔버스는 풀에서 빌린 것.
  //   호출 전에 texPool.bindTarget(texObj) 로 대상을 FBO 에 붙여 둔다.
  function downloadTo(canvas, w, h) {
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    _downloads++;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const rb = w * 4;
    // readPixels 는 아래에서 위로 — 위에서 아래로(2D 캔버스 방향) 뒤집어 담는다.
    for (let y = 0; y < h; y++) {
      const sy = (h - 1 - y) * rb;
      d.set(px.subarray(sy, sy + rb), y * rb);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  return {
    uploadInto,
    downloadTo,
    get uploads() { return _uploads; },
    get downloads() { return _downloads; },
    reset() { _uploads = 0; _downloads = 0; },
  };
}
