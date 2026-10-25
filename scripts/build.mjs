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
  // PWA 앱 아이콘(매니페스트가 참조). src-tauri 아래가 아니라 중립 폴더(pwa-icons)에 둔다 —
  // Tauri 2 는 frontendDist 가 'src-tauri' 폴더를 포함하면 빌드를 거부한다(R15).
  { src: 'pwa-icons',            dst: 'pwa-icons' },
];

for (const { src, dst } of items) {
  cpSync(join(root, src), join(dist, dst), { recursive: true });
  console.log(`copied: ${src} -> dist/${dst}`);
}

// ── PWA: 앱 파일 목록 + 버전 생성(F5-5) ────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push('./' + relative(dist, p).split('\\').join('/'));
  }
  return out;
}
// 처음 설치 때 미리 받는 글꼴은 "화면(UI)에 쓰는 글꼴"만 둔다(R13-3).
//   --font-ui: IBM Plex Sans KR(화면이 쓰는 굵기 400/500/700), --font-mono: JetBrains Mono.
//   글자 레이어용 글꼴(Noto Sans/Serif KR·Black Han Sans·IBM Plex Light 300)은 미리 받지 않고,
//   처음 쓸 때 받아 서비스 워커의 별도 글꼴 캐시(apng2-fonts)에 남긴다.
const UI_FONT_FILES = new Set([
  'IBMPlexSansKR-Regular.woff2',  // 400 기본
  'IBMPlexSansKR-Medium.woff2',   // 500
  'IBMPlexSansKR-Bold.woff2',     // 600→700 폴백 포함
  'JetBrainsMono-VF.woff2',       // 고정폭(코드·숫자)
]);
function isPrecachedFont(f) {
  // vendor/fonts 아래 woff2 중 UI 글꼴만 미리 캐시 대상.
  const m = f.match(/\/vendor\/fonts\/([^/]+\.woff2)$/i);
  if (!m) return true;                 // 글꼴 파일이 아니면 평소대로 포함
  return UI_FONT_FILES.has(m[1]);
}

// sw.js, sw-files.json 자신은 제외 + 글자 레이어용 글꼴 제외
const allFiles = walk(dist).filter((f) => f !== './sw.js' && f !== './sw-files.json');
const files = allFiles.filter(isPrecachedFont);
writeFileSync(join(dist, 'sw-files.json'), JSON.stringify(files));

// 처음 설치 때 받는 총 용량 보고(글꼴 절감 확인용).
const precacheBytes = files.reduce((a, f) => a + statSync(join(dist, f.slice(2))).size, 0);
const skippedFonts = allFiles.filter((f) => !isPrecachedFont(f));
const skippedBytes = skippedFonts.reduce((a, f) => a + statSync(join(dist, f.slice(2))).size, 0);
console.log(`sw-files.json: ${files.length} files, 미리 받기 ${(precacheBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  글꼴 미리 받기 제외: ${skippedFonts.length}개 ${(skippedBytes / 1024 / 1024).toFixed(2)} MB (처음 쓸 때 받음)`);

// 버전 = 빌드 시각(캐시 무효화·새 버전 안내용). sw.js 의 __SW_VERSION__ 치환.
const version = new Date().toISOString().replace(/[:.]/g, '-');
const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace('__SW_VERSION__', version);
writeFileSync(swPath, sw);
console.log(`sw version: ${version}`);

console.log('build done: dist/');
