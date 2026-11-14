// PNG書き出し(Canvasに自前で描画)と、データ(Tier構成+画像Base64)のJSON書き出し・読み込み。

import { TEXT } from './text.js';
import {
  getActiveList, getItemUrl, serializeState, newId, normalizeState, replaceAll, appendLists,
} from './state.js';
import { getBlob, putBlob, clearAll } from './storage.js';
import { showToast, openDialog } from './render.js';

const APP_ID = 'tier_maker';
const DATA_FORMAT = 1;
const PNG_SCALE = 2;                 // 書き出し倍率(画面より細かく)
const CANVAS_MAX_SIDE = 16384;       // ブラウザのCanvas上限に収める
const CANVAS_MAX_PIXELS = 64e6;
const DOWNLOAD_REVOKE_MS = 10000;

// ---- 共通 ----

function safeFileName(name) {
  return (name || APP_ID).replace(/[\\/:*?"<>|\r\n]+/g, '_').trim() || APP_ID;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS);
}

// ---- PNG ----

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// 改行を保ったまま、幅に収まるように折り返す(空白があればそこで、無ければ文字単位で)
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of [...para]) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) {
        const sp = line.lastIndexOf(' ');
        if (sp > 0 && ch !== ' ') {
          lines.push(line.slice(0, sp));
          line = line.slice(sp + 1) + ch;
        } else {
          lines.push(line);
          line = ch === ' ' ? '' : ch;
        }
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

// 画面上の配置(位置・大きさ・色)をそのまま読み取って描くので、見た目が画面と一致する
export async function exportPng() {
  const board = document.getElementById('board');
  const rows = [...board.querySelectorAll(':scope > .tier-row')];
  if (!rows.length) return;
  try {
    const boardRect = board.getBoundingClientRect();
    const boardStyle = getComputedStyle(board);
    const lineW = parseFloat(boardStyle.borderTopWidth) || 0;
    // 右端の操作部は含めない。代わりに右側にも区切り線の幅を足す
    const controlsLeft = rows[0].querySelector('.tier-controls').getBoundingClientRect().left;
    const width = Math.round(controlsLeft - boardRect.left + lineW);
    const height = Math.round(boardRect.height);
    const scale = Math.min(
      PNG_SCALE,
      CANVAS_MAX_SIDE / width,
      CANVAS_MAX_SIDE / height,
      Math.sqrt(CANVAS_MAX_PIXELS / (width * height)),
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.imageSmoothingQuality = 'high';

    // 背景=区切り線の色
    ctx.fillStyle = boardStyle.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const rel = (r) => ({ x: r.left - boardRect.left, y: r.top - boardRect.top, w: r.width, h: r.height });

    for (const row of rows) {
      const r = rel(row.getBoundingClientRect());
      ctx.fillStyle = getComputedStyle(row).backgroundColor;
      ctx.fillRect(r.x, r.y, width - lineW - r.x, r.h);

      // ラベル
      const labelEl = row.querySelector('.tier-label');
      const lr = rel(labelEl.getBoundingClientRect());
      const labelStyle = getComputedStyle(labelEl);
      ctx.fillStyle = labelStyle.backgroundColor;
      ctx.fillRect(lr.x, lr.y, lr.w, lr.h);

      const textEl = row.querySelector('.tier-label-text');
      const boxEl = row.querySelector('.tier-label-box');
      const ts = getComputedStyle(textEl);
      const fontSize = parseFloat(ts.fontSize);
      const lineHeight = parseFloat(ts.lineHeight) || fontSize * 1.2;
      ctx.font = `${ts.fontStyle} ${ts.fontWeight} ${fontSize}px ${ts.fontFamily}`;
      ctx.fillStyle = ts.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const br = rel(boxEl.getBoundingClientRect());
      const lines = wrapText(ctx, textEl.textContent, br.w);
      const cx = br.x + br.w / 2;
      let y = br.y + br.h / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(br.x, br.y, br.w, br.h);
      ctx.clip();
      for (const line of lines) {
        ctx.fillText(line, cx, y);
        y += lineHeight;
      }
      ctx.restore();

      // 画像(object-fit: contain と同じ計算)
      for (const itemEl of row.querySelectorAll('.tier-items > .item')) {
        const url = getItemUrl(itemEl.dataset.itemId);
        if (!url) continue;
        const img = await loadImage(url);
        if (!img) continue;
        const ir = rel(itemEl.getBoundingClientRect());
        const nw = img.naturalWidth || ir.w;
        const nh = img.naturalHeight || ir.h;
        const k = Math.min(ir.w / nw, ir.h / nh);
        const dw = nw * k;
        const dh = nh * k;
        ctx.drawImage(img, ir.x + (ir.w - dw) / 2, ir.y + (ir.h - dh) / 2, dw, dh);
      }
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    downloadBlob(blob, `${safeFileName(getActiveList().name)}.png`);
    showToast(TEXT.pngSaved);
  } catch (err) {
    console.error(err);
    showToast(TEXT.pngFailed);
  }
}

// ---- データの書き出し ----

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl, fallbackMime) {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('invalid data url');
  const meta = dataUrl.slice(5, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = meta.split(';')[0] || fallbackMime || 'application/octet-stream';
  if (meta.includes(';base64')) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

// すべての表と画像を1つのJSONにする。巨大な1本の文字列を作らないよう、部品ごとに Blob へ渡す
export async function exportData() {
  const s = serializeState();
  const ids = Object.keys(s.items);
  const toast = ids.length ? showToast(TEXT.progress(0, ids.length), { sticky: true }) : null;
  try {
    const parts = [
      `{"app":${JSON.stringify(APP_ID)},"format":${DATA_FORMAT},`,
      `"activeListId":${JSON.stringify(s.activeListId)},`,
      `"lists":${JSON.stringify(s.lists)},"items":{`,
    ];
    let first = true;
    for (let i = 0; i < ids.length; i++) {
      const item = s.items[ids[i]];
      const blob = await getBlob(item.blobKey);
      if (blob) {
        const data = await blobToDataUrl(blob);
        parts.push(`${first ? '' : ','}${JSON.stringify(item.id)}:${JSON.stringify({ name: item.name, mime: item.mime, data })}`);
        first = false;
      }
      toast?.update(TEXT.progress(i + 1, ids.length));
    }
    parts.push('}}');
    downloadBlob(new Blob(parts, { type: 'application/json' }), `tier_maker_${timestamp()}.json`);
    toast?.close();
    showToast(TEXT.saved);
  } catch (err) {
    console.error(err);
    toast?.close();
    showToast(TEXT.saveFailed);
  }
}

// ---- データの読み込み ----

export async function importDataFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!data || data.app !== APP_ID || !Array.isArray(data.lists) || typeof data.items !== 'object') {
      throw new Error('not a tier_maker file');
    }
  } catch (err) {
    console.error(err);
    showToast(TEXT.loadFailed);
    return;
  }

  const mode = await openDialog({
    title: TEXT.importTitle,
    message: TEXT.importMessage,
    buttons: [
      { label: TEXT.cancel, value: null },
      { label: TEXT.importAdd, value: 'add' },
      { label: TEXT.importReplace, value: 'replace', kind: 'primary' },
    ],
  });
  if (!mode) return;

  const ids = Object.keys(data.items);
  const toast = ids.length ? showToast(TEXT.progress(0, ids.length), { sticky: true }) : null;
  try {
    // 画像をデコードし、IDを振り直す(自分の書き出しファイルを「追加」しても重複しないように)
    const idMap = new Map();
    const rawItems = {};
    const blobs = new Map();
    ids.forEach((oldId, i) => {
      const it = data.items[oldId];
      try {
        const blob = dataUrlToBlob(String(it.data || ''), it.mime);
        const id = newId('img');
        idMap.set(oldId, id);
        rawItems[id] = { id, name: String(it.name || ''), mime: String(it.mime || blob.type), blobKey: id };
        blobs.set(id, blob);
      } catch (err) {
        console.error(err);
      }
      toast?.update(TEXT.progress(i + 1, ids.length));
    });
    const mapIds = (arr) => (Array.isArray(arr) ? arr : []).map((id) => idMap.get(id)).filter(Boolean);
    const listIdMap = new Map();
    const rawLists = data.lists.filter((l) => l && Array.isArray(l.tiers)).map((l) => {
      const id = newId('list');
      listIdMap.set(l.id, id);
      return {
        id,
        name: l.name,
        tiers: l.tiers.map((t) => ({ id: newId('tier'), label: t.label, color: t.color, itemIds: mapIds(t.itemIds) })),
        unsorted: mapIds(l.unsorted),
      };
    });
    const next = normalizeState(
      { lists: rawLists, activeListId: listIdMap.get(data.activeListId), items: rawItems },
      (id) => blobs.has(id),
    );
    if (!next) throw new Error('empty data');

    if (mode === 'replace') await clearAll();
    for (const id of Object.keys(next.items)) await putBlob(id, blobs.get(id));
    const usedBlobs = new Map(Object.keys(next.items).map((id) => [id, blobs.get(id)]));
    if (mode === 'replace') replaceAll(next, usedBlobs);
    else appendLists(next.lists, next.items, usedBlobs);

    toast?.close();
    showToast(TEXT.loaded);
  } catch (err) {
    console.error(err);
    toast?.close();
    showToast(TEXT.loadFailed);
  }
}
