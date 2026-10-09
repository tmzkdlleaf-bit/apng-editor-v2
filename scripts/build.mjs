import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const root = resolve(process.cwd());
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const items = [
  { src: 'index.html',           dst: 'index.html' },
  { src: 'src',                  dst: 'src' },
  { src: 'vendor',               dst: 'vendor' },
  { src: 'sw.js',                dst: 'sw.js' },
  { src: 'manifest.webmanifest', dst: 'manifest.webmanifest' },
];

for (const { src, dst } of items) {
  cpSync(join(root, src), join(dist, dst), { recursive: true });
  console.log(`copied: ${src} -> dist/${dst}`);
}

// PWA 앱 아이콘(매니페스트가 참조) — src-tauri/icons 중 필요한 것만 복사
try {
  mkdirSync(join(dist, 'src-tauri', 'icons'), { recursive: true });
  for (const f of ['128x128.png', '128x128@2x.png']) {
    cpSync(join(root, 'src-tauri', 'icons', f), join(dist, 'src-tauri', 'icons', f));
  }
} catch { /* 아이콘 없으면 건너뜀 */ }

// ── PWA: 앱 파일 목록 + 버전 생성(F5-5) ────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push('./' + relative(dist, p).split('\\').join('/'));
  }
  return out;
}
// sw.js, sw-files.json 자신은 제외
const files = walk(dist).filter((f) => f !== './sw.js' && f !== './sw-files.json');
writeFileSync(join(dist, 'sw-files.json'), JSON.stringify(files));
console.log(`sw-files.json: ${files.length} files`);

// 버전 = 빌드 시각(캐시 무효화·새 버전 안내용). sw.js 의 __SW_VERSION__ 치환.
const version = new Date().toISOString().replace(/[:.]/g, '-');
const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace('__SW_VERSION__', version);
writeFileSync(swPath, sw);
console.log(`sw version: ${version}`);

console.log('build done: dist/');
