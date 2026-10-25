// 시작 템플릿 + 캔버스 프리셋(F5-3) — 데이터 한 파일.
// S5-5: 시험 효과/모션 틀을 실제 효과(sparkle·bokeh)·모션(bob)으로 교체.
import { createDoc, createLayer, createClip } from '../core/doc/schema.js';
import { getMotion } from '../motions/registry.js';
import { getEffect } from '../effects/registry.js';

// 효과 레이어 — 등록된 효과의 기본 파라미터를 채운 뒤 몇 개만 덮어쓴다(잘못된 키 방지).
function _fx(name, effectId, overrides = {}, { scope = 'full', box = null, seed = 1 } = {}) {
  const eff = getEffect(effectId);
  const params = {};
  for (const p of (eff?.params ?? [])) params[p.key] = p.default;
  Object.assign(params, overrides);
  const layer = createLayer('effect', { name, effectId });
  layer.params = params; layer.seed = seed; layer.scope = scope; layer.box = box;
  layer.transform.x.value = 0; layer.transform.y.value = 0;
  return layer;
}
// 키프레임 x/y 프롭 만들기(미끄러짐 등).
function _keyed(keys) { return { value: keys[0]?.v ?? 0, keys: keys.map((k) => ({ ...k })) }; }
// 판정 글자 세트(2·3·4 공용) — 한 text 레이어를 "세트 칸"으로, 성공/실패/크리티컬/펌블 변형 넣기.
function _judgeVariants(layerId, { success, fail, crit, fumble }) {
  return {
    slots: [{ id: 'v_judge', layerId, kind: 'text', label: '판정 글자' }],
    rows: [
      { id: 'r_success', name: '성공',    values: { v_judge: success } },
      { id: 'r_fail',    name: '실패',    values: { v_judge: fail } },
      { id: 'r_crit',    name: '크리티컬', values: { v_judge: crit } },
      { id: 'r_fumble',  name: '펌블',    values: { v_judge: fumble } },
    ],
  };
}

// 캔버스 크기 프리셋 (바꿀 수 있는 기본값)
export const CANVAS_PRESETS = [
  { key: 'ccfolia-cutin',   label: '코코포리아 컷인', w: 768,  h: 768 },
  { key: 'bg',              label: '배경',           w: 1280, h: 720 },
  { key: 'standing',        label: '스탠딩',         w: 600,  h: 900 },
  { key: 'discord-sticker', label: '디스코드 스티커', w: 320,  h: 320 },
];

function _add(doc, layer) { doc.layers[layer.id] = layer; doc.order.push(layer.id); return layer; }

export const TEMPLATES = [
  {
    key: 'empty', label: '빈 캔버스',
    build() {},
  },
  {
    key: 'sparkle-circle', label: '반짝이는 원',
    build(doc) {
      const cx = doc.meta.width / 2, cy = doc.meta.height / 2;
      const circle = createLayer('shape', { name: '원' });
      circle.shape = { kind: 'ellipse', w: Math.min(doc.meta.width, doc.meta.height) * 0.5, h: Math.min(doc.meta.width, doc.meta.height) * 0.5, fill: '#5eb8f0', stroke: null };
      circle.transform.x.value = cx; circle.transform.y.value = cy;
      _add(doc, circle);
      const fx = createLayer('effect', { name: '반짝임', effectId: 'sparkle' });
      fx.params = { count: 60, size: 10, speed: 2, color: '#ffe9a8', shape: 'four', opacity: 1 };
      fx.seed = 42;
      _add(doc, fx);
    },
  },
  {
    key: 'glow-text', label: '빛나는 글자',
    build(doc) {
      const t = createLayer('text', { name: '글자' });
      t.text = '반짝'; t.size = Math.round(doc.meta.height * 0.2); t.color = '#ffffff';
      t.align = 'center';
      t.shadow = { blur: 12, offsetX: 0, offsetY: 0, color: '#ffcc66' };
      t.transform.x.value = doc.meta.width / 2; t.transform.y.value = doc.meta.height / 2;
      _add(doc, t);
    },
  },
  {
    key: 'loop-bg', label: '루프 배경',
    build(doc) {
      const bg = createLayer('shape', { name: '배경' });
      bg.shape = { kind: 'rect', w: doc.meta.width, h: doc.meta.height, fill: '#1a1f2c', stroke: null };
      bg.transform.x.value = doc.meta.width / 2; bg.transform.y.value = doc.meta.height / 2;
      _add(doc, bg);
      const fx = createLayer('effect', { name: '빛망울', effectId: 'bokeh' });
      fx.params = { count: 24, size: 36, variance: 0.6, speed: 1, color: '#6ea8e0', color2: '#a0c8ff', opacity: 0.6 };
      fx.seed = 7;
      _add(doc, fx);
      // 둥실 모션으로 빛망울 레이어가 약하게 움직임(루프)
      const bob = getMotion('bob');
      if (bob) { fx.clips = [createClip(bob, { start: 0, length: doc.meta.frameCount, params: { amplitude: 6, cycles: 1 } })]; }
    },
  },

  // ── R14-1 코코포리아 컷인 템플릿 6종(768×768 권장) ─────────────────────────
  {
    key: 'cutin-slide', label: '컷인: 캐릭터 등장',
    build(doc) {
      doc.meta.frameCount = 36; doc.meta.playback = 'once';
      const W = doc.meta.width, H = doc.meta.height, cx = W / 2;
      const cy = Math.round(H * 0.46);
      // 옆에서 미끄러져 등장 → 멈춤 → 퇴장(한 번 재생). 자리표시 도형과 안내 글자를 함께 움직인다.
      const slide = [
        { f: 0,  v: -W * 0.45, ease: 'easeOutCubic' },
        { f: 9,  v: cx,        ease: 'linear' },
        { f: 27, v: cx,        ease: 'easeInCubic' },
        { f: 35, v: W * 1.45,  ease: 'linear' },
      ];
      const ph = createLayer('shape', { name: '캐릭터 이미지 자리' });
      ph.shape = { kind: 'rect', w: Math.round(W * 0.42), h: Math.round(H * 0.7), radius: 16, fill: '#3a3f4a', stroke: { color: '#6a7180', width: 3 } };
      ph.transform.x = _keyed(slide); ph.transform.y.value = cy;
      _add(doc, ph);
      const hint = createLayer('text', { name: '안내 글자' });
      hint.text = '이미지를 넣으세요'; hint.size = Math.round(H * 0.035); hint.color = '#aab0bb'; hint.align = 'center';
      hint.transform.x = _keyed(slide); hint.transform.y.value = cy;
      _add(doc, hint);
      const band = createLayer('shape', { name: '이름 띠' });
      band.shape = { kind: 'rect', w: Math.round(W * 0.62), h: Math.round(H * 0.12), radius: 8, fill: '#1b2030', stroke: null };
      band.transform.x.value = cx; band.transform.y.value = Math.round(H * 0.84);
      _add(doc, band);
      const nameT = createLayer('text', { name: '이름 글자' });
      nameT.text = '이름'; nameT.size = Math.round(H * 0.06); nameT.color = '#ffffff'; nameT.align = 'center';
      nameT.transform.x.value = cx; nameT.transform.y.value = Math.round(H * 0.84);
      _add(doc, nameT);
    },
  },
  {
    key: 'cutin-critical', label: '컷인: 크리티컬',
    build(doc) {
      doc.meta.frameCount = 24; doc.meta.playback = 'loop';
      const W = doc.meta.width, H = doc.meta.height;
      _add(doc, _fx('빛줄기', 'light-beams', { color: '#ffe08a', opacity: 0.9 }, { seed: 11 }));
      const t = createLayer('text', { name: '판정 글자' });
      t.text = 'CRITICAL'; t.size = Math.round(H * 0.16); t.weight = 900; t.color = '#ffdd55'; t.align = 'center';
      t.shadow = { blur: 18, offsetX: 0, offsetY: 0, color: '#ff9a2e' };
      t.transform.x.value = W / 2; t.transform.y.value = H / 2;
      const tada = getMotion('tada');
      if (tada) t.clips = [createClip(tada, { start: 0, length: doc.meta.frameCount })];
      _add(doc, t);
      _add(doc, _fx('반짝임', 'sparkle', { color: '#fff2c0' }, { seed: 7 }));
      doc.variants = _judgeVariants(t.id, { success: '성공', fail: '실패', crit: '대성공', fumble: '대실패' });
    },
  },
  {
    key: 'cutin-fumble', label: '컷인: 펌블',
    build(doc) {
      doc.meta.frameCount = 24; doc.meta.playback = 'loop';
      const W = doc.meta.width, H = doc.meta.height;
      const bg = createLayer('shape', { name: '배경' });
      bg.shape = { kind: 'rect', w: W, h: H, fill: '#140a10', stroke: null };
      bg.transform.x.value = W / 2; bg.transform.y.value = H / 2;
      _add(doc, bg);
      const t = createLayer('text', { name: '판정 글자' });
      t.text = 'FUMBLE'; t.size = Math.round(H * 0.16); t.weight = 900; t.color = '#d7415a'; t.align = 'center';
      t.transform.x.value = W / 2; t.transform.y.value = H / 2;
      const shake = getMotion('shake');
      if (shake) t.clips = [createClip(shake, { start: 0, length: doc.meta.frameCount, params: { amplitude: 8, cycles: 6 } })];
      _add(doc, t);
      _add(doc, _fx('글리치', 'glitch', {}, { seed: 3 }));
      _add(doc, _fx('노이즈', 'tv-noise', { opacity: 0.35 }, { seed: 5 }));
      doc.variants = _judgeVariants(t.id, { success: '성공', fail: '실패', crit: '대성공', fumble: '대실패' });
    },
  },
  {
    key: 'cutin-result', label: '컷인: 판정 결과 글자',
    build(doc) {
      doc.meta.frameCount = 30; doc.meta.playback = 'once';
      const W = doc.meta.width, H = doc.meta.height;
      const band = createLayer('shape', { name: '배경 띠' });
      band.shape = { kind: 'rect', w: W, h: Math.round(H * 0.22), radius: 0, fill: '#141821', stroke: null };
      band.transform.x.value = W / 2; band.transform.y.value = H / 2;
      _add(doc, band);
      const t = createLayer('text', { name: '판정 글자' });
      t.text = '성공 32/65'; t.size = Math.round(H * 0.1); t.weight = 700; t.color = '#ffffff'; t.align = 'center';
      t.transform.x.value = W / 2; t.transform.y.value = H / 2;
      // 타자기 등장(한 번) — 가운데에서 한 글자씩. 한 번 재생이라 이음새 경고 없음.
      t.reveal = { mode: 'char', startF: 0, endF: 16, loop: 'once' };
      _add(doc, t);
      doc.variants = _judgeVariants(t.id, { success: '성공 32/65', fail: '실패 70/65', crit: '대성공!', fumble: '대실패...' });
    },
  },
  {
    key: 'cutin-transition', label: '컷인: 장면 전환',
    build(doc) {
      doc.meta.frameCount = 24; doc.meta.playback = 'once';
      // 커튼으로 화면을 덮었다 걷기(한 번). 커튼 효과는 전환형이라 once 로.
      _add(doc, _fx('커튼', 'curtain', { color: '#101218' }, { seed: 1 }));
    },
  },
  {
    key: 'cutin-loop-frame', label: '컷인: 반복 배경',
    build(doc) {
      doc.meta.frameCount = 24; doc.meta.playback = 'loop';
      const W = doc.meta.width, H = doc.meta.height;
      // 테두리(정지) + 은은한 반복 효과 — 루프 이음새 경고 0.
      const border = createLayer('shape', { name: '테두리' });
      border.shape = { kind: 'rect', w: Math.round(W * 0.92), h: Math.round(H * 0.92), radius: 18, fill: null, stroke: { color: '#ffd27f', width: 6 } };
      border.transform.x.value = W / 2; border.transform.y.value = H / 2;
      _add(doc, border);
      _add(doc, _fx('빛망울', 'bokeh', { count: 20, color: '#8fb8ff', color2: '#c7dbff', opacity: 0.5 }, { seed: 9 }));
    },
  },
];

// 템플릿 + 프리셋으로 새 문서 생성.
export function createProjectFromTemplate(templateKey = 'empty', presetKey = 'ccfolia-cutin') {
  const preset = CANVAS_PRESETS.find((p) => p.key === presetKey) ?? CANVAS_PRESETS[0];
  const doc = createDoc({ width: preset.w, height: preset.h });
  const tpl = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0];
  try { tpl.build(doc); } catch {}
  return doc;
}
