import { createDoc, createLayer } from '../core/doc/schema.js';

export function createDemoDoc() {
  const doc = createDoc({ width: 400, height: 400, fps: 12, frameCount: 24 });

  // 배경 (잠금)
  const bg = createLayer('shape');
  bg.name = '배경';
  bg.shape = { kind: 'rect', w: 400, h: 400, fill: '#1e2a36', stroke: null };
  bg.transform.x.value = 200;
  bg.transform.y.value = 200;
  bg.locked = true;
  doc.layers[bg.id] = bg;
  doc.order.push(bg.id);

  // 주황색 사각형
  const rect = createLayer('shape');
  rect.name = '사각형';
  rect.shape = { kind: 'rect', w: 80, h: 80, fill: '#f0a35e', stroke: null };
  rect.transform.x.value = 200;
  rect.transform.y.value = 150;
  doc.layers[rect.id] = rect;
  doc.order.push(rect.id);

  // 파란 원
  const circle = createLayer('shape');
  circle.name = '원';
  circle.shape = { kind: 'ellipse', w: 60, h: 60, fill: '#5eb8f0', stroke: null };
  circle.transform.x.value = 300;
  circle.transform.y.value = 250;
  doc.layers[circle.id] = circle;
  doc.order.push(circle.id);

  // 텍스트
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
