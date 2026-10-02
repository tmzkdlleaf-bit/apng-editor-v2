import { createDoc, createLayer } from '../core/doc/schema.js';

// 단순 400×400 데모 (기존)
export function createDemoDoc() {
  const doc = createDoc({ width: 400, height: 400, fps: 12, frameCount: 24 });

  const bg = createLayer('shape');
  bg.name = '배경';
  bg.shape = { kind: 'rect', w: 400, h: 400, fill: '#1e2a36', stroke: null };
  bg.transform.x.value = 200;
  bg.transform.y.value = 200;
  bg.locked = true;
  doc.layers[bg.id] = bg;
  doc.order.push(bg.id);

  const rect = createLayer('shape');
  rect.name = '사각형';
  rect.shape = { kind: 'rect', w: 80, h: 80, fill: '#f0a35e', stroke: null };
  rect.transform.x.value = 200;
  rect.transform.y.value = 150;
  doc.layers[rect.id] = rect;
  doc.order.push(rect.id);

  const circle = createLayer('shape');
  circle.name = '원';
  circle.shape = { kind: 'ellipse', w: 60, h: 60, fill: '#5eb8f0', stroke: null };
  circle.transform.x.value = 300;
  circle.transform.y.value = 250;
  doc.layers[circle.id] = circle;
  doc.order.push(circle.id);

  const text = createLayer('text');
  text.name = '텍스트';
  text.text = 'APNG';
  text.size = 32;
  text.color = '#ffffff';
  text.transform.x.value = 200;
  text.transform.y.value = 300;
  doc.layers[text.id] = text;
  doc.order.push(text.id);

  return doc;
}

// P4 스타일 768×768 데모 (?demo=1) — 성능 측정 기준과 동일 구성
// 이미지10 + 글자3 + effect3
export function createLargeDemo() {
  const doc = createDoc({ width: 768, height: 768, fps: 12, frameCount: 24 });

  const bg = createLayer('shape');
  bg.name = '배경';
  bg.shape = { kind: 'rect', w: 768, h: 768, fill: '#1a1f2c', stroke: null };
  bg.transform.x.value = 384;
  bg.transform.y.value = 384;
  bg.locked = true;
  doc.layers[bg.id] = bg;
  doc.order.push(bg.id);

  // 사각형, 원 (UI 조작 테스트용)
  const rect = createLayer('shape');
  rect.name = '사각형';
  rect.shape = { kind: 'rect', w: 100, h: 100, fill: '#f0a35e', stroke: null };
  rect.transform.x.value = 250;
  rect.transform.y.value = 300;
  doc.layers[rect.id] = rect;
  doc.order.push(rect.id);

  const circle = createLayer('shape');
  circle.name = '원';
  circle.shape = { kind: 'ellipse', w: 80, h: 80, fill: '#5eb8f0', stroke: null };
  circle.transform.x.value = 520;
  circle.transform.y.value = 380;
  doc.layers[circle.id] = circle;
  doc.order.push(circle.id);

  // image 레이어 10개 (assetId 없음 — 빈 이미지로 렌더)
  // 중심 위치: 5열×2행, 75 + col*140 / 75 + row*140 (스텝 140)
  // 에지(±50)가 스냅 임계(docCenter=384 기준 ±12px)에 걸리지 않도록 140 스텝 사용
  // 최대 y bound = 215+50 = 265, 사각형(250,300)·원(520,380)과 겹치지 않음
  for (let i = 0; i < 10; i++) {
    const img = createLayer('image');
    img.name = `이미지${i + 1}`;
    img.assetId = String(i);
    img.w = 100;
    img.h = 100;
    img.transform.x.value = 75 + (i % 5) * 140;
    img.transform.y.value = 75 + Math.floor(i / 5) * 140;
    if (i < 5) img.adjust = { brightness: 80 };
    doc.layers[img.id] = img;
    doc.order.push(img.id);
  }

  // text 레이어 3개
  const textColors = ['#ffffff', '#ffcc00', '#00ccff'];
  const textLabels = ['코코포리아', 'APNG Editor', '애니메이션'];
  for (let i = 0; i < 3; i++) {
    const text = createLayer('text');
    text.name = `글자${i + 1}`;
    text.text  = textLabels[i];
    text.color = textColors[i];
    text.size  = 40;
    text.font  = 'sans-serif';
    text.transform.x.value = 384;
    text.transform.y.value = 500 + i * 60;
    doc.layers[text.id] = text;
    doc.order.push(text.id);
  }

  // effect 레이어 3개 (test-dots)
  for (let i = 0; i < 3; i++) {
    const eff = createLayer('effect');
    eff.name     = `이펙트${i + 1}`;
    eff.effectId = 'test-dots';
    eff.seed     = i + 1;
    eff.scope    = 'full';
    eff.params   = { count: 200, phase: true };
    doc.layers[eff.id] = eff;
    doc.order.push(eff.id);
  }

  return doc;
}
