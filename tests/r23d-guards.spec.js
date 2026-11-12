// R23d 3부(item 13·14) — 소스 규칙 가드. 화면을 열지 않고 파일만 읽어 검사한다.
//   13: src/styles 에서 tokens.css 를 뺀 파일에 직접 색(#rgb/#rrggbb/rgb()) 0개.
//   14: src/core 에 document./window. 0개, src 전체에 이모지 0개.
import { test, expect } from './helpers/fixtures.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'src');

// 주석·문자열 안의 우연한 일치까지 다 잡는다(규칙은 "코드·주석·UI 어디에도").
function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...walk(p, exts)); continue; }
    if (exts.test(name)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(join(__dir, '..'), p).replace(/\\/g, '/');

test.describe('R23d 가드 — 소스 규칙', () => {
  test('[13] styles(tokens.css 제외)에 직접 색 0개', () => {
    // rgba(...) 는 그림자·반투명 가림막에 쓰므로 금지 대상이 아니다(rgb( 만 금지).
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const rgbNoAlpha = /\brgb\(/;
    const offenders = [];
    for (const p of walk(join(SRC, 'styles'), /\.css$/)) {
      if (/tokens\.css$/.test(p)) continue;
      const txt = readFileSync(p, 'utf8');
      txt.split('\n').forEach((ln, i) => {
        if (hex.test(ln) || rgbNoAlpha.test(ln)) offenders.push(`${rel(p)}:${i + 1}  ${ln.trim()}`);
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('[14a] src/core 에 document.·window. 0개', () => {
    const rx = /\b(document|window)\./;
    const offenders = [];
    for (const p of walk(join(SRC, 'core'), /\.js$/)) {
      const txt = readFileSync(p, 'utf8');
      txt.split('\n').forEach((ln, i) => {
        if (rx.test(ln)) offenders.push(`${rel(p)}:${i + 1}  ${ln.trim()}`);
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('[14b] src 전체에 이모지 0개', () => {
    const rx = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
    const offenders = [];
    for (const p of walk(SRC, /\.(js|css|html)$/)) {
      const txt = readFileSync(p, 'utf8');
      txt.split('\n').forEach((ln, i) => {
        if (rx.test(ln)) offenders.push(`${rel(p)}:${i + 1}  ${ln.trim()}`);
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
