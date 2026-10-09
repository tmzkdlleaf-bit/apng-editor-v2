// 시작 템플릿 + 캔버스 프리셋(F5-3) — 데이터 한 파일.
// 템플릿 내용은 5단계 효과·모션이 나오면 여기서 교체한다(지금은 시험 효과/모션으로 틀만).
import { createDoc, createLayer, createClip } from '../core/doc/schema.js';
import { getMotion } from '../motions/registry.js';

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
      const fx = createLayer('effect', { name: '반짝임', effectId: 'test-dots' });
      fx.params = { count: 300, radius: 3, color: '#ffffff', phase: true };
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
      const fx = createLayer('effect', { name: '점 흐름', effectId: 'test-dots' });
      fx.params = { count: 500, radius: 2, color: '#6ea8e0', phase: true };
      fx.seed = 7;
      _add(doc, fx);
      // 둥실 모션으로 배경이 약하게 움직임(루프)
      const float = getMotion('test-float');
      if (float) { bg.clips = [createClip(float, { start: 0, length: doc.meta.frameCount, params: { amplitude: 6 } })]; }
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
