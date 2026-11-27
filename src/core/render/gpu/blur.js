// GPU 흐림(R34a) — CPU blur.js 의 blurCanvas/blurToSmall 과 같은 입력·출력(2D 캔버스 in → 2D 캔버스 out).
//   CPU 파이프라인을 WebGL2 로 재현한다:
//     ① 축소(면적 평균 d×d ≈ drawImage 'high')  ② 작은 크기에서 분리형 박스 3회(가로→세로)  ③ 확대(쌍선형).
//   박스 패스가 "가로 → 세로" 두 번 나눠 도는 셰이더다(렌더 규칙 — ctx.filter 금지, 직접 계산).
//   DOM 없음. 2D 출력 캔버스는 호출자가 준 borrow/release(풀)로만 만든다. 텍스처는 내부 texPool 로만.
import { createProgram, createQuad, VS_QUAD } from './program.js';

// 축소: 출력 텍셀마다 입력 d×d 블록의 평균. CPU drawImage 축소가 프리멀티 공간에서 일어나므로
//   여기서도 프리멀티(rgb×a)로 평균한 뒤 straight 로 되돌린다(알파가 섞인 자리 색이 CPU 와 맞도록).
const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform int uD;
uniform ivec2 uIn;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 prgb = vec3(0.0);
  float sa = 0.0, cnt = 0.0;
  for (int j = 0; j < uD; j++) {
    for (int i = 0; i < uD; i++) {
      ivec2 s = ivec2(p.x * uD + i, p.y * uD + j);
      if (s.x >= uIn.x || s.y >= uIn.y) continue;
      vec4 t = texelFetch(uTex, s, 0);
      prgb += t.rgb * t.a;
      sa += t.a;
      cnt += 1.0;
    }
  }
  float a = sa / max(cnt, 1.0);
  o = vec4(sa > 0.0 ? prgb / sa : vec3(0.0), a);
}`;

// 분리형 박스(반경 uR, 가장자리 클램프). CPU applyBlur 의 한 패스(sr/diam, 균등 가중)와 같은 계산.
const FS_BOX = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform ivec2 uSize;
uniform ivec2 uDir;
uniform int uR;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int k = -uR; k <= uR; k++) {
    ivec2 s = clamp(p + uDir * k, ivec2(0), uSize - ivec2(1));
    sum += texelFetch(uTex, s, 0);
  }
  o = sum / float(2 * uR + 1);
}`;

// 확대: 작은 텍스처의 [0,sw]×[0,sh] 영역을 전체 크기로 쌍선형으로 늘린다.
//   drawImage(small, 0,0,sw,sh, 0,0,W,H) 'low'(쌍선형) 대응. 쌍선형도 프리멀티 공간에서 해야
//   투명 가장자리 색이 CPU 와 맞는다 → 하드웨어 LINEAR 대신 셰이더에서 4텍셀 프리멀티 보간.
const FS_UP = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSrc;     // (sw, sh) 유효 영역(텍셀)
uniform ivec2 uTexI;   // (cw, chh) 작은 텍스처 크기(텍셀, 정수)
in vec2 vUv;
out vec4 o;
vec4 pm(ivec2 c) { vec4 t = texelFetch(uTex, clamp(c, ivec2(0), uTexI - ivec2(1)), 0); return vec4(t.rgb * t.a, t.a); }
void main() {
  vec2 t = vUv * uSrc;
  t = clamp(t, vec2(0.5), uSrc - vec2(0.5));
  vec2 f = t - 0.5;             // 텍셀 중심 기준 좌표
  ivec2 i = ivec2(floor(f));
  vec2 fr = f - vec2(i);
  vec4 c00 = pm(i), c10 = pm(i + ivec2(1, 0)), c01 = pm(i + ivec2(0, 1)), c11 = pm(i + ivec2(1, 1));
  vec4 top = mix(c00, c10, fr.x), bot = mix(c01, c11, fr.x);
  vec4 p = mix(top, bot, fr.y);
  o = vec4(p.a > 0.0 ? p.rgb / p.a : vec3(0.0), p.a);
}`;

export function createGpuBlur(gl, texPool, uploader) {
  const quad = createQuad(gl);
  const progDown = createProgram(gl, VS_QUAD, FS_DOWN);
  const progBox  = createProgram(gl, VS_QUAD, FS_BOX);
  const progUp   = createProgram(gl, VS_QUAD, FS_UP);

  const uDown = {
    tex: gl.getUniformLocation(progDown, 'uTex'),
    d:   gl.getUniformLocation(progDown, 'uD'),
    in:  gl.getUniformLocation(progDown, 'uIn'),
  };
  const uBox = {
    tex:  gl.getUniformLocation(progBox, 'uTex'),
    size: gl.getUniformLocation(progBox, 'uSize'),
    dir:  gl.getUniformLocation(progBox, 'uDir'),
    r:    gl.getUniformLocation(progBox, 'uR'),
  };
  const uUp = {
    tex:  gl.getUniformLocation(progUp, 'uTex'),
    src:  gl.getUniformLocation(progUp, 'uSrc'),
    texI: gl.getUniformLocation(progUp, 'uTexI'),
  };

  function _prep() {
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(quad.vao);
  }
  function _drawInto(target) {
    texPool.bindTarget(target);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function _bindSrc(texObj, prog, loc) {
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texObj.tex);
    gl.uniform1i(loc, 0);
  }

  // CPU blurToSmall 과 같은 결과를 texPool 텍스처로 돌려준다: { texObj, sw, sh, cw, chh }(호출자가 release).
  function _blurToSmallTex(src, r) {
    const W = src.width, H = src.height;
    const d = Math.max(2, Math.ceil(r / 1.5));
    const cw = Math.max(1, Math.ceil(W / d)), chh = Math.max(1, Math.ceil(H / d));
    const R = Math.max(1, Math.round(r / d));

    const texSrc = texPool.borrow(W, H);
    uploader.uploadInto(texSrc.tex, src);

    _prep();
    // ① 축소
    let a = texPool.borrow(cw, chh);
    _bindSrc(texSrc, progDown, uDown.tex);
    gl.uniform1i(uDown.d, d);
    gl.uniform2i(uDown.in, W, H);
    _drawInto(a);
    texPool.release(texSrc);

    // ② 박스 3회(가로→세로)
    let b = texPool.borrow(cw, chh);
    gl.useProgram(progBox);
    gl.uniform1i(uBox.tex, 0);
    gl.uniform2i(uBox.size, cw, chh);
    gl.uniform1i(uBox.r, R);
    for (let pass = 0; pass < 3; pass++) {
      _bindSrc(a, progBox, uBox.tex); gl.uniform2i(uBox.dir, 1, 0); _drawInto(b);
      _bindSrc(b, progBox, uBox.tex); gl.uniform2i(uBox.dir, 0, 1); _drawInto(a);
    }
    texPool.release(b);
    return { texObj: a, sw: W / d, sh: H / d, cw, chh };
  }

  // 작은 크기 흐림 결과를 "줄인 크기"의 2D 캔버스로 — CPU blurToSmall 과 같은 형태 { canvas, sw, sh }.
  function blurToSmall(src, r, borrow) {
    const sm = _blurToSmallTex(src, r);
    const out = borrow(sm.cw, sm.chh);
    texPool.bindTarget(sm.texObj);
    uploader.downloadTo(out, sm.cw, sm.chh);
    texPool.release(sm.texObj);
    return { canvas: out, sw: sm.sw, sh: sm.sh };
  }

  // src(2D 캔버스)를 반경 r 로 흐린 결과를 새 2D 캔버스(src 크기, 풀에서 빌림)에 담아 돌려준다.
  function blurCanvas(src, r, borrow, release) {
    const W = src.width, H = src.height;
    const out = borrow(W, H);
    if (!(r > 0.5)) { out.getContext('2d').drawImage(src, 0, 0); return out; }

    const sm = _blurToSmallTex(src, r);
    // ③ 확대
    const full = texPool.borrow(W, H);
    _prep();
    _bindSrc(sm.texObj, progUp, uUp.tex);
    gl.uniform2f(uUp.src, sm.sw, sm.sh);
    gl.uniform2i(uUp.texI, sm.cw, sm.chh);
    _drawInto(full);
    texPool.release(sm.texObj);

    texPool.bindTarget(full);
    uploader.downloadTo(out, W, H);
    texPool.release(full);
    return out;
  }

  function dispose() {
    quad.dispose();
    gl.deleteProgram(progDown);
    gl.deleteProgram(progBox);
    gl.deleteProgram(progUp);
  }

  return { blurCanvas, blurToSmall, dispose };
}
