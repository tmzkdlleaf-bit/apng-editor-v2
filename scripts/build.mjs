import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const items = [
  { src: 'index.html', dst: 'index.html' },
  { src: 'src',        dst: 'src' },
  { src: 'vendor',     dst: 'vendor' },
];

for (const { src, dst } of items) {
  cpSync(join(root, src), join(dist, dst), { recursive: true });
  console.log(`copied: ${src} -> dist/${dst}`);
}

console.log('build done: dist/');
