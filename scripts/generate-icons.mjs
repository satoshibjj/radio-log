// assets/icon.svg から PWA 用 PNG アイコンを生成する（dev / build 前に自動実行）
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const src = new URL('../assets/icon.svg', import.meta.url);
const outDir = new URL('../public/icons/', import.meta.url);
const BG = '#F6F1E7';

const svg = await readFile(src);
await mkdir(outDir, { recursive: true });

const out = (name) => new URL(name, outDir).pathname;
await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png'));

// maskable：中央80%の安全領域に収める
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: inner, left: 56, top: 56 }])
  .png()
  .toFile(out('maskable-512.png'));

console.log('icons generated → public/icons/');
