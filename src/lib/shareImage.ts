/**
 * リピート回のシェア画像（1080×1350 PNG）を Canvas API で直接描画する。
 * 外部フォント・外部画像は使わない（CORS による描画失敗・白紙化を防ぐため）。
 * デザイン：ヴィンテージ・カセットテープのインデックスカード／ラジオ放送記録票
 */
import type { AppearanceRole } from '../db/types';

export interface ShareCardData {
  programName: string;
  station: string;
  /** YYYY-MM-DD */
  broadcastDate: string;
  cast: { name: string; role: AppearanceRole }[];
  memo: string;
}

export const SHARE_W = 1080;
export const SHARE_H = 1350;

const C = {
  paper: '#F6F1E7',
  paper2: '#EFE7D6',
  card: '#FBF6EA',
  rust: '#C84B31',
  rustDark: '#A33A24',
  brass: '#B8860B',
  brassSoft: '#E9D6A3',
  ink: '#2B2623',
  inkSoft: '#5C524A',
  inkMute: '#8A7E72',
  line: '#D9CCB2',
  guest: '#3F6E6A',
};

const SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "Meiryo", system-ui, sans-serif';
const DISPLAY = '"Rockwell", "Roboto Slab", "Courier New", Courier, "Hiragino Mincho ProN", serif';

const WEEK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function font(weight: number, size: number, family = SANS): string {
  return `${weight} ${size}px ${family}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 日本語にも対応した折り返し（文字単位、英単語はなるべく分割しない、行頭禁則の簡易対応）。
 * maxLines を超えたら最終行末尾を「…」で省略。
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; truncated: boolean } {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  const NO_LINE_START = '、。，．,.!?！？)）」』】ーっゃゅょァィゥェォッャュョ々…';
  let truncated = false;

  outer: for (const para of paragraphs) {
    // 英数字の連続はひとかたまり、それ以外は1文字ずつ
    const tokens = para.match(/[A-Za-z0-9'’\-_.:/@#]+|\s+|./gu) ?? [''];
    let line = '';
    for (let i = 0; i < tokens.length; i++) {
      let tok = tokens[i];
      const candidate = line + tok;
      if (ctx.measureText(candidate).width <= maxWidth || line === '') {
        // 1トークンが長すぎる場合は文字単位で分割
        if (line === '' && ctx.measureText(tok).width > maxWidth && tok.length > 1) {
          const chars = Array.from(tok);
          tokens.splice(i, 1, ...chars);
          tok = tokens[i];
        }
        line += tok;
        continue;
      }
      // 行頭禁則：次の文字が禁則文字なら現在行に押し込む（ぶら下げ）
      if (tok.length === 1 && NO_LINE_START.includes(tok)) {
        line += tok;
        continue;
      }
      lines.push(line.trimEnd());
      if (lines.length >= maxLines) {
        truncated = true;
        break outer;
      }
      line = tok.trimStart();
    }
    lines.push(line.trimEnd());
    if (lines.length >= maxLines) {
      // まだ段落が残っていれば省略
      const idx = paragraphs.indexOf(para);
      if (idx < paragraphs.length - 1 && paragraphs.slice(idx + 1).some((p) => p.trim())) truncated = true;
      break;
    }
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = Array.from(last).slice(0, -1).join('');
    lines[lines.length - 1] = `${last}…`;
  }
  // 末尾の空行を除去
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return { lines, truncated };
}

/** 長い番組名は収まるまでフォントを小さくする */
function fitTitle(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): { size: number; lines: string[] } {
  for (const size of [84, 76, 68, 60, 54]) {
    ctx.font = font(800, size);
    const { lines, truncated } = wrapText(ctx, text, maxWidth, 2);
    if (!truncated) return { size, lines };
  }
  ctx.font = font(800, 54);
  return { size: 54, lines: wrapText(ctx, text, maxWidth, 2).lines };
}

function drawTuningScale(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, seed: number): void {
  // 帯
  ctx.fillStyle = C.ink;
  roundRect(ctx, x, y, w, 132, 18);
  ctx.fill();

  // 目盛り
  const left = x + 40;
  const right = x + w - 40;
  const base = y + 92;
  ctx.strokeStyle = C.brassSoft;
  ctx.fillStyle = C.brassSoft;
  ctx.lineWidth = 2;
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const px = left + ((right - left) * i) / steps;
    const major = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(px, base);
    ctx.lineTo(px, base - (major ? 30 : 14));
    ctx.stroke();
  }
  ctx.font = font(700, 20, DISPLAY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const labels = ['53', '60', '70', '80', '90', '100', '120', '140', '160', 'kHz'];
  labels.forEach((l, i) => {
    const px = left + ((right - left) * i) / (labels.length - 1);
    ctx.fillText(l, px, base - 40);
  });
  ctx.textAlign = 'left';
  ctx.font = font(700, 18, DISPLAY);
  ctx.fillText('AM', x + 22, y + 32);
  ctx.textAlign = 'right';
  ctx.fillText('RADIO LOG', x + w - 22, y + 32);
  ctx.textAlign = 'left';

  // チューニング針（日付から決まる位置）
  const ratio = 0.18 + ((seed % 997) / 997) * 0.64;
  const nx = left + (right - left) * ratio;
  ctx.save();
  ctx.shadowColor = 'rgba(232, 131, 58, 0.9)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = C.rust;
  ctx.fillRect(nx - 3, y + 18, 6, 104);
  ctx.restore();
}

function pillWidth(ctx: CanvasRenderingContext2D, label: string, tag: string): number {
  ctx.font = font(700, 30);
  const tw = ctx.measureText(label).width;
  ctx.font = font(800, 16, DISPLAY);
  const tagW = ctx.measureText(tag).width + 18;
  return 22 + tw + 14 + tagW + 14;
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  tag: string,
  guest: boolean,
): number {
  const h = 58;
  ctx.font = font(700, 30);
  const tw = ctx.measureText(label).width;
  ctx.font = font(800, 16, DISPLAY);
  const tagW = ctx.measureText(tag).width + 18;
  const w = 22 + tw + 14 + tagW + 14;

  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = guest ? '#E6F0EE' : '#FFFDF8';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = guest ? C.guest : C.ink;
  ctx.stroke();

  ctx.fillStyle = guest ? C.guest : C.ink;
  ctx.font = font(700, 30);
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 22, y + h / 2 + 1);

  const tx = x + 22 + tw + 14;
  roundRect(ctx, tx, y + 15, tagW, 28, 6);
  ctx.fillStyle = guest ? C.guest : C.brass;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(800, 16, DISPLAY);
  ctx.fillText(tag, tx + 9, y + 30);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function hashString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

export function drawShareCard(canvas: HTMLCanvasElement, d: ShareCardData): void {
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('この端末では画像を作成できません（Canvas 非対応）。');

  // 背景（クラフト紙）
  ctx.fillStyle = C.paper2;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.fillStyle = 'rgba(43, 38, 35, 0.025)';
  for (let yy = 0; yy < SHARE_H; yy += 6) ctx.fillRect(0, yy, SHARE_W, 2);

  // インデックスカード
  const M = 56;
  const cardX = M;
  const cardY = M;
  const cardW = SHARE_W - M * 2;
  const cardH = SHARE_H - M * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(43, 38, 35, 0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // 内側の細枠
  roundRect(ctx, cardX + 14, cardY + 14, cardW - 28, cardH - 28, 18);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.line;
  ctx.stroke();

  const px = cardX + 48; // 内側左端
  const pw = cardW - 96; // 内側幅
  let y = cardY + 44;

  // ヘッダーラベル
  ctx.fillStyle = C.rust;
  ctx.font = font(700, 26, DISPLAY);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('★ REPEAT ARCHIVE', px, y + 26);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.inkMute;
  ctx.font = font(700, 22, DISPLAY);
  ctx.fillText(`No. ${String(hashString(d.programName + d.broadcastDate) % 10000).padStart(4, '0')}`, px + pw, y + 26);
  ctx.textAlign = 'left';
  y += 48;

  // チューニングスケール
  drawTuningScale(ctx, px, y, pw, hashString(d.broadcastDate + d.programName));
  y += 132 + 52;

  // 番組名
  ctx.fillStyle = C.ink;
  const title = fitTitle(ctx, d.programName, pw);
  ctx.font = font(800, title.size);
  for (const line of title.lines) {
    y += title.size * 1.05;
    ctx.fillText(line, px, y);
  }
  y += 26;

  // 放送局バッジ＋放送日
  const [yy, mm, dd] = d.broadcastDate.split('-').map(Number);
  const wd = Number.isFinite(yy) ? WEEK_EN[new Date(yy, mm - 1, dd).getDay()] : '';
  let bx = px;
  if (d.station.trim()) {
    ctx.font = font(800, 28);
    const sw = ctx.measureText(d.station).width + 36;
    roundRect(ctx, bx, y, sw, 52, 8);
    ctx.fillStyle = '#F8EDCF';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.brass;
    ctx.stroke();
    ctx.fillStyle = '#6B4E05';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.station, bx + 18, y + 27);
    bx += sw + 24;
  }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.rustDark;
  ctx.font = font(700, 22, DISPLAY);
  ctx.fillText('ON AIR', bx, y + 27);
  bx += ctx.measureText('ON AIR').width + 14;
  ctx.fillStyle = C.ink;
  ctx.font = font(700, 36, DISPLAY);
  ctx.fillText(`${d.broadcastDate}${wd ? ` ${wd}` : ''}`, bx, y + 28);
  ctx.textBaseline = 'alphabetic';
  y += 52 + 40;

  // 区切り（カセットのテープ窓風の破線）
  const sectionTitle = (label: string) => {
    ctx.fillStyle = C.rust;
    ctx.beginPath();
    ctx.arc(px + 9, y - 9, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.inkSoft;
    ctx.font = font(800, 24, DISPLAY);
    ctx.fillText(label, px + 30, y);
    const lx = px + 30 + ctx.measureText(label).width + 16;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(lx, y - 9);
    ctx.lineTo(px + pw, y - 9);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // 出演者（最大3行、収まらない分は「ほかN名」）
  if (d.cast.length > 0) {
    sectionTitle('CAST');
    y += 26;
    const maxRows = 3;
    const restLabel = (n: number) => `ほか${n}名`;
    let cx = px;
    let row = 1;
    let shown = 0;
    for (let i = 0; i < d.cast.length; i++) {
      const p = d.cast[i];
      const tag = p.role === 'guest' ? 'GUEST' : 'REG';
      const w = pillWidth(ctx, p.name, tag);
      // 最終行では「ほかN名」の余白も確保
      ctx.font = font(700, 26);
      const reserve = row === maxRows && i < d.cast.length - 1 ? ctx.measureText(restLabel(99)).width + 20 : 0;
      if (cx > px && cx + w + reserve > px + pw) {
        if (row === maxRows) break;
        row++;
        cx = px;
        y += 72;
      }
      drawPill(ctx, cx, y, p.name, tag, p.role === 'guest');
      cx += w + 14;
      shown++;
    }
    if (shown < d.cast.length) {
      ctx.fillStyle = C.inkMute;
      ctx.font = font(700, 26);
      ctx.textBaseline = 'middle';
      ctx.fillText(restLabel(d.cast.length - shown), cx + 6, y + 30);
      ctx.textBaseline = 'alphabetic';
    }
    y += 58 + 56;
  }

  // メモ（罫線つき）
  const footerTop = cardY + cardH - 110;
  {
    // メモが無くてもインデックスカード風に罫線だけ描く
    sectionTitle(d.memo.trim() ? 'WHY REPEAT' : 'NOTES');
    y += 20;
    const lineH = 52;
    const maxLines = Math.max(1, Math.floor((footerTop - 20 - y) / lineH));
    ctx.font = font(500, 32);
    const { lines } = d.memo.trim() ? wrapText(ctx, d.memo.trim(), pw - 8, maxLines) : { lines: [] as string[] };
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    for (let i = 0; i < maxLines; i++) {
      const ly = y + lineH * (i + 1);
      ctx.beginPath();
      ctx.moveTo(px, ly);
      ctx.lineTo(px + pw, ly);
      ctx.stroke();
    }
    ctx.fillStyle = C.ink;
    ctx.font = font(500, 32);
    lines.forEach((l, i) => ctx.fillText(l, px + 4, y + lineH * (i + 1) - 13));
  }

  // フッター（アプリ名クレジット）
  const fy = cardY + cardH - 62;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, fy - 30);
  ctx.lineTo(px + pw, fy - 30);
  ctx.stroke();
  // 小さなダイヤル
  ctx.beginPath();
  ctx.arc(px + 18, fy, 16, 0, Math.PI * 2);
  ctx.fillStyle = C.brass;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 18, fy);
  ctx.lineTo(px + 26, fy - 11);
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.font = font(700, 26, DISPLAY);
  ctx.textBaseline = 'middle';
  ctx.fillText('Radio Log', px + 46, fy + 1);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.inkMute;
  ctx.font = font(700, 20, DISPLAY);
  ctx.fillText('KEEP IT ON REPEAT', px + pw, fy + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の書き出しに失敗しました。'))), 'image/png');
  });
}

export async function createShareImage(d: ShareCardData): Promise<Blob> {
  // システムフォントの読み込み完了を待つ（対応ブラウザのみ）
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* noop */
  }
  const canvas = document.createElement('canvas');
  drawShareCard(canvas, d);
  return canvasToPngBlob(canvas);
}

export function shareFileName(broadcastDate: string): string {
  return `radio-log-${broadcastDate}.png`;
}
