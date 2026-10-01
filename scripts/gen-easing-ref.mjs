// old/가 있을 때 로컬에서 한 번 실행: node scripts/gen-easing-ref.mjs
// tests/fixtures/easing-reference.json 생성.
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { sampleTrack, cubicBezierEval } = await import('../old/src/core/animator.js');

const NAMES = [
  'linear', 'easeIn', 'easeOut', 'easeInOut',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeOutQuint', 'easeInOutQuint', 'easeInOutSine',
  'easeOutBack', 'easeInOutBack', 'easeOutElastic', 'easeOutBounce',
  'cssEase', 'cssEaseIn', 'cssEaseOut', 'cssEaseInOut',
];

// t = 0, 0.05, 0.10, ..., 1.0 (21 points). f = i * 50 (정수, 반올림 없음)
const N = 20;
const easings = {};
for (const name of NAMES) {
  const track = [{ f: 0, v: 0, e: name }, { f: 1000, v: 1 }];
  easings[name] = Array.from({ length: N + 1 }, (_, i) => sampleTrack(track, 'x', i * 50));
}

const bzControl = [0.42, 0, 0.58, 1.0];
const cubicBezier = {
  control: bzControl,
  samples: Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    return cubicBezierEval(bzControl[0], bzControl[1], bzControl[2], bzControl[3], t);
  }),
};

const outDir = join(__dirname, '../tests/fixtures');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'easing-reference.json'), JSON.stringify({ easings, cubicBezier }, null, 2), 'utf8');
console.log('easing-reference.json 생성 완료');
