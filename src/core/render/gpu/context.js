// WebGL2 컨텍스트 받기(R34a). DOM 금지 — 주입받은 createCanvas 로만 캔버스를 만든다.
//   못 받으면 null 을 돌려주고 끝(오류 없음). 엔진은 null 이면 조용히 CPU 로 동작한다.
//   컨텍스트 분실(webglcontextlost) 시 isLost()=true 로 바꾸고 콘솔에 경고 한 줄 — 엔진이 CPU 로 되돌린다.

export function createGLContext(createCanvas) {
  if (typeof createCanvas !== 'function') return null;

  let canvas = null;
  try { canvas = createCanvas(16, 16); } catch { return null; }
  if (!canvas || typeof canvas.getContext !== 'function') return null;

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false, // straight alpha — 2D 캔버스(getImageData)와 같은 전제로 직접 합성
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
  } catch { gl = null; }
  if (!gl) return null;

  let _lost = false;
  let _warned = false;
  const onLost = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    _lost = true;
    if (!_warned && typeof console !== 'undefined') {
      console.warn('GPU 렌더: WebGL2 컨텍스트를 잃었습니다 — CPU 렌더로 돌아갑니다.');
      _warned = true;
    }
  };
  // OffscreenCanvas 는 addEventListener 가 없을 수 있다 — 있을 때만 건다.
  if (typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('webglcontextlost', onLost, false);
  }

  return {
    gl,
    canvas,
    isLost() { return _lost || (typeof gl.isContextLost === 'function' && gl.isContextLost()); },
  };
}
