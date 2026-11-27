// GPU 흐림(R34a, R34b 재정의) — CPU blur.js 의 blurCanvas/blurToSmall 과 같은 입력·출력(2D 캔버스 in → out).
//   CPU 파이프라인을 WebGL2 로 그대로 재현한다(축소 배율·박스 반경은 blurDims 한 곳에서 공유):
//     ① 칸평균 축소(프리멀티 색×알파로 평균 — 투명 가장자리 색 번짐을 막는다)
//     ② 작은 크기에서 프리멀티 상태로 분리형 박스 3회(가로→세로)
//     ③ 직접 쌍선형 확대(프리멀티 보간)  ④ 언프리멀티
//   중간 텍스처는 RGBA8(8비트) — CPU Uint8ClampedArray 와 같은 정밀도.
//   세로 방향은 uploader 가 FLIP_Y 로 넣고 download 가 되돌린다 → CPU 뒤집기 계산과 같은 좌표계.
//   DOM 없음. 2D 출력 캔버스는 호출자가 준 borrow/release(풀)로만. 텍스처는 내부 texPool 로만.
import { createProgram, createQuad, VS_QUAD } from './program.js';
import { blurDims } from '../blur.js';

// 축소: 출력 텍셀마다 입력 d×d 블록의 프리멀티 평균. 결과도 프리멀티(rgb=색×알파, a=알파)로 둔다.
//   가장자리에서 입력 밖 표본은 건너뛰고 유효 개수(cnt)로 나눈다(CPU 와 동일).
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
  o = vec4(prgb / cnt, sa / cnt); // 프리멀티
}`;

// 분리형 박스(반경 uR, 가장자리 클램프). 프리멀티 4채널을 균등 평균 — CPU applyBlur 한 패스와 같은 계산.
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

// 언프리멀티: 프리멀티 텍스처를 straight 로. blurToSmall 이 작은 캔버스로 내리기 전에 한 번 쓴다.
const FS_UNPM = `#version 300 es
precision highp float;
uniform sampler2D uTex;
out vec4 o;
void main() {
  vec4 t = texelFetch(uTex, ivec2(gl_FragCoord.xy), 0);
  o = vec4(t.a > 0.0 ? t.rgb / t.a : vec3(0.0), t.a);
}`;

// 확대: 작은 프리멀티 텍스처의 [0,sw]×[0,sh] 영역을 전체 크기로 쌍선형 보간 후 언프리멀티.
//   입력이 이미 프리멀티라 4텍셀을 그대로 섞는다(투명 가장자리 색 번짐 없음). CPU 쌍선형과 같은 좌표 규칙.
const FS_UP = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSrc;     // (sw, sh) 유효 영역(텍셀)
uniform ivec2 uTexI;   // (cw, chh) 작은 텍스처 크기(텍셀, 정수)
in vec2 vUv;
out vec4 o;
vec4 fetch(ivec2 c) { return texelFetch(uTex, clamp(c, ivec2(0), uTexI - ivec2(1)), 0); }
void main() {
  vec2 t = vUv * uSrc;
  t = clamp(t, vec2(0.5), uSrc - vec2(0.5));
  vec2 f = t - 0.5;             // 텍셀 중심 기준 좌표
  ivec2 i = ivec2(floor(f));
  vec2 fr = f - vec2(i);
  vec4 c00 = fetch(i), c10 = fetch(i + ivec2(1, 0)), c01 = fetch(i + ivec2(0, 1)), c11 = fetch(i + ivec2(1, 1));
  vec4 top = mix(c00, c10, fr.x), bot = mix(c01, c11, fr.x);
  vec4 p = mix(top, bot, fr.y);
  o = vec4(p.a > 0.0 ? p.rgb / p.a : vec3(0.0), p.a);
}`;

export function createGpuBlur(gl, texPool, uploader) {
  const quad = createQuad(gl);
  const progDown = createProgram(gl, VS_QUAD, FS_DOWN);
  const progBox  = createProgram(gl, VS_QUAD, FS_BOX);
  const progUnpm = createProgram(gl, VS_QUAD, FS_UNPM);
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
  const uUnpm = { tex: gl.getUniformLocation(progUnpm, 'uTex') };
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

  // ① 축소 + ② 박스 3회 한 "작은 프리멀티" 텍스처를 돌려준다: { texObj, sw, sh, cw, chh }(호출자가 release).
  function _blurToSmallTex(src, r) {
    const W = src.width, H = src.height;
    const { d, cw, chh, R, sw, sh } = blurDims(W, H, r);

    const texSrc = texPool.borrow(W, H);
    uploader.uploadInto(texSrc.tex, src);

    _prep();
    // ① 축소(프리멀티)
    let a = texPool.borrow(cw, chh);
    _bindSrc(texSrc, progDown, uDown.tex);
    gl.uniform1i(uDown.d, d);
    gl.uniform2i(uDown.in, W, H);
    _drawInto(a);
    texPool.release(texSrc);

    // ② 박스 3회(가로→세로), 프리멀티 상태 유지
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
    return { texObj: a, sw, sh, cw, chh };
  }

  // 작은 크기 흐림 결과를 "줄인 크기"의 2D 캔버스로 — CPU blurToSmall 과 같은 형태 { canvas, sw, sh }.
  function blurToSmall(src, r, borrow) {
    const sm = _blurToSmallTex(src, r);
    // 언프리멀티 → straight 작은 텍스처
    const straight = texPool.borrow(sm.cw, sm.chh);
    _prep();
    _bindSrc(sm.texObj, progUnpm, uUnpm.tex);
    _drawInto(straight);
    texPool.release(sm.texObj);

    const out = borrow(sm.cw, sm.chh);
    texPool.bindTarget(straight);
    uploader.downloadTo(out, sm.cw, sm.chh);
    texPool.release(straight);
    return { canvas: out, sw: sm.sw, sh: sm.sh };
  }

  // src(2D 캔버스)를 반경 r 로 흐린 결과를 새 2D 캔버스(src 크기, 풀에서 빌림)에 담아 돌려준다.
  function blurCanvas(src, r, borrow, release) {
    const W = src.width, H = src.height;
    const out = borrow(W, H);
    if (!(r > 0.5)) { out.getContext('2d').drawImage(src, 0, 0); return out; }

    const sm = _blurToSmallTex(src, r);
    // ③ 확대(프리멀티 보간) + ④ 언프리멀티
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
    gl.deleteProgram(progUnpm);
    gl.deleteProgram(progUp);
  }

  return { blurCanvas, blurToSmall, dispose };
}
