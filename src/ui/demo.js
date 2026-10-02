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

// P4 스타일 768×768 데모 (?demo=1)
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

  const text = createLayer('text');
  text.name = '텍스트';
  text.text = 'APNG Editor';
  text.size = 48;
  text.color = '#ffffff';
  text.transform.x.value = 384;
  text.transform.y.value = 620;
  doc.layers[text.id] = text;
  doc.order.push(text.id);

  return doc;
}
