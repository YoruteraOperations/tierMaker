// 画像の取り込み(ファイル選択・ページへのドロップ・貼り付け)。
// 元ファイルを Blob のまま IndexedDB に保存してから状態へ追加する(画質は落とさない)。

import { putBlob } from './storage.js';
import { addItem, newId } from './state.js';
import { showToast } from './render.js';
import { TEXT } from './text.js';

const IMAGE_EXT = /\.(png|apng|jpe?g|jfif|gif|webp|avif|svg|bmp|ico)$/i;
const YIELD_EVERY = 4;   // この枚数ごとに描画の機会を譲る

let queue = Promise.resolve();
let total = 0;
let done = 0;
let failed = 0;
let progress = null;

export function isImageFile(file) {
  return (file.type && file.type.startsWith('image/')) || IMAGE_EXT.test(file.name || '');
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function updateProgress() {
  const text = TEXT.progress(done, total);
  if (!progress) progress = showToast(text, { sticky: true });
  else progress.update(text);
}

// 選んだ順に1枚ずつ非同期で取り込む。取り込み中に追加された分も同じ列に並ぶ
export function importFiles(fileList) {
  const all = [...fileList];
  const files = all.filter(isImageFile);
  if (!files.length) {
    if (all.length) showToast(TEXT.notImage);
    return queue;
  }
  total += files.length;
  updateProgress();
  queue = queue.then(() => processFiles(files));
  return queue;
}

async function processFiles(files) {
  for (const file of files) {
    try {
      const id = newId('img');
      await putBlob(id, file);
      addItem({ id, name: file.name || 'image', mime: file.type || '', blobKey: id }, file);
    } catch (err) {
      console.error(err);
      failed++;
    }
    done++;
    updateProgress();
    if (done % YIELD_EVERY === 0) await nextFrame();
  }
  if (done >= total) finish();
}

function finish() {
  progress?.close();
  progress = null;
  showToast(failed ? TEXT.addFailed(failed) : TEXT.added(total));
  total = 0;
  done = 0;
  failed = 0;
}

export function initUpload() {
  const fileInput = document.getElementById('file-input');
  const overlay = document.getElementById('drop-overlay');

  fileInput.addEventListener('change', () => {
    importFiles(fileInput.files);
    fileInput.value = '';
  });

  // ページ全体へのファイルドロップ。並び替えのドラッグ(ファイルを含まない)には反応しない
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    importFiles(e.dataTransfer.files);
  });

  // 貼り付け(Ctrl+V)
  document.addEventListener('paste', (e) => {
    const data = e.clipboardData;
    if (!data) return;
    let files = [...data.files];
    if (!files.length) {
      files = [...data.items].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
    }
    files = files.filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    importFiles(files);
  });
}

export function openFilePicker() {
  document.getElementById('file-input').click();
}
