// 初期化とイベント登録。各モジュールをここから読み込み、保存データの復元→描画→操作の受け付けの順に立ち上げる。

import { TEXT } from './text.js';
import {
  subscribe, getState, getUi, getActiveList, serializeState, normalizeState, replaceAll,
  switchList, selectItem, deleteItem,
} from './state.js';
import {
  loadState, saveState, getBlob, listBlobKeys, deleteBlob, clearAll, requestPersist,
} from './storage.js';
import { initRender, render, showToast, openDialog, isDialogOpen, scheduleFitLabels } from './render.js';
import { wasJustDragged } from './dragdrop.js';
import { initUpload, openFilePicker } from './upload.js';
import {
  makeDefaultList, addTierAt, beginLabelEdit, openTierSettings,
  createListInteractive, renameActiveListInteractive, deleteActiveListInteractive,
} from './tierEditor.js';
import { exportPng, exportData, importDataFile } from './exporter.js';

const SAVE_DELAY_MS = 300;
const ITEM_SIZE_KEY = 'tier_maker_item_size';   // 画像サイズは端末ごとの表示設定として localStorage に置く
const ITEM_SIZE_MIN = 40;
const ITEM_SIZE_MAX = 160;

let saveTimer = null;

// ---- 文言の差し込み ----

function applyTexts() {
  document.title = TEXT.appTitle;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = TEXT[el.dataset.t];
  for (const el of document.querySelectorAll('[data-t-aria]')) {
    el.setAttribute('aria-label', TEXT[el.dataset.tAria]);
    el.title = TEXT[el.dataset.tAria];
  }
}

// ---- 保存・復元 ----

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  return saveState(serializeState()).catch((err) => {
    console.error(err);
    showToast(TEXT.saveFailed);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
}

function initialState() {
  const list = makeDefaultList(TEXT.listName(1));
  return { lists: [list], activeListId: list.id, items: {} };
}

async function restore() {
  let saved = null;
  let keys = [];
  try {
    [saved, keys] = await Promise.all([loadState(), listBlobKeys()]);
  } catch (err) {
    console.error(err);
  }
  const keySet = new Set(keys);
  const next = saved ? normalizeState(saved, (id) => keySet.has(saved.items[id]?.blobKey || id)) : null;
  if (!next) {
    replaceAll(initialState());
    return;
  }
  const blobs = new Map();
  for (const item of Object.values(next.items)) {
    const blob = await getBlob(item.blobKey);
    if (blob) blobs.set(item.id, blob);
    else delete next.items[item.id];
  }
  replaceAll(normalizeState(next, (id) => blobs.has(id)) || initialState(), blobs);

  // どこからも参照されない画像本体を掃除する
  const used = new Set(Object.values(getState().items).map((it) => it.blobKey));
  for (const key of keys) if (!used.has(key)) deleteBlob(key).catch(() => {});
}

// ---- 画像サイズ ----

function readStoredSize() {
  try {
    const v = Number(localStorage.getItem(ITEM_SIZE_KEY));
    return v >= ITEM_SIZE_MIN && v <= ITEM_SIZE_MAX ? v : null;
  } catch {
    return null;
  }
}

function applyItemSize(px, store) {
  document.documentElement.style.setProperty('--item-size', `${px}px`);
  if (store) {
    try { localStorage.setItem(ITEM_SIZE_KEY, String(px)); } catch { /* 保存できなくても表示は変わる */ }
  }
  scheduleFitLabels();
}

function initSizeControl() {
  const range = document.getElementById('size-range');
  const stored = readStoredSize();
  if (stored) applyItemSize(stored, false);
  range.value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--item-size')) || 80;
  range.addEventListener('input', () => applyItemSize(Number(range.value), true));
}

// ---- メニュー ----

function setMenuOpen(btnId, panel, open) {
  const btn = document.getElementById(btnId);
  btn.setAttribute('aria-expanded', String(open));
  if (panel.id === 'tools') panel.classList.toggle('is-open', open);
  else panel.hidden = !open;
}

function closeMenus(except) {
  const tools = document.getElementById('tools');
  const listMenu = document.getElementById('list-menu');
  if (except !== 'tools') setMenuOpen('more-btn', tools, false);
  if (except !== 'list') setMenuOpen('list-menu-btn', listMenu, false);
}

function toggleMenu(kind) {
  if (kind === 'tools') {
    const tools = document.getElementById('tools');
    setMenuOpen('more-btn', tools, !tools.classList.contains('is-open'));
  } else {
    const menu = document.getElementById('list-menu');
    setMenuOpen('list-menu-btn', menu, menu.hidden);
  }
}

// ---- 操作 ----

async function resetAll() {
  const ok = await openDialog({
    message: TEXT.confirmReset,
    buttons: [{ label: TEXT.cancel, value: false }, { label: TEXT.reset, value: true, kind: 'danger' }],
    cancelValue: false,
  });
  if (!ok) return;
  clearTimeout(saveTimer);
  await clearAll();
  replaceAll(initialState());
  showToast(TEXT.resetDone);
}

function handleAction(action, el) {
  switch (action) {
    case 'toggle-tools': toggleMenu('tools'); closeMenus('tools'); return;
    case 'toggle-list-menu': toggleMenu('list'); closeMenus('list'); return;
    case 'add-images': openFilePicker(); break;
    case 'add-tier': addTierAt(null); break;
    case 'export-png': exportPng(); break;
    case 'export-data': exportData(); break;
    case 'import-data': document.getElementById('data-input').click(); break;
    case 'reset': resetAll(); break;
    case 'new-list': createListInteractive(getState().lists); break;
    case 'rename-list': renameActiveListInteractive(); break;
    case 'delete-list': deleteActiveListInteractive(); break;
    case 'tier-settings': openTierSettings(el.dataset.tierId); break;
    case 'delete-item': {
      const itemEl = el.closest('.item');
      if (itemEl) deleteItem(itemEl.dataset.itemId);
      break;
    }
    case 'edit-label': {
      const row = el.closest('.tier-row');
      if (row) beginLabelEdit(row.dataset.tierId, row.querySelector('.tier-label-text'));
      break;
    }
    default: return;
  }
  closeMenus();
}

function onClick(e) {
  const target = e.target;
  if (!target.closest('#tools, #more-btn, #list-menu, #list-menu-btn')) closeMenus();

  const actionEl = target.closest('[data-action]');
  if (actionEl) {
    handleAction(actionEl.dataset.action, actionEl);
    return;
  }

  const itemEl = target.closest('.item');
  if (itemEl && !itemEl.closest('#trash')) {
    if (wasJustDragged()) return;
    const id = itemEl.dataset.itemId;
    selectItem(getUi().selectedItemId === id ? null : id);
    return;
  }

  // 未分類が空のときは、その枠のクリックでファイル選択を開く
  if (target.id === 'unsorted' && getActiveList().unsorted.length === 0) {
    openFilePicker();
    return;
  }

  if (getUi().selectedItemId) selectItem(null);
}

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onKeyDown(e) {
  if (isDialogOpen() || isTyping(e.target)) return;
  const sel = getUi().selectedItemId;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
    e.preventDefault();
    deleteItem(sel);
  } else if (e.key === 'Escape') {
    closeMenus();
    if (sel) selectItem(null);
  }
}

// ---- 起動 ----

async function start() {
  applyTexts();
  initRender();
  initUpload();
  initSizeControl();
  requestPersist();

  await restore();
  render();
  subscribe(({ persist }) => {
    render();
    if (persist) scheduleSave();
  });
  scheduleSave();

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  document.getElementById('list-select').addEventListener('change', (e) => switchList(e.target.value));
  document.getElementById('data-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importDataFile(file);
  });
  window.addEventListener('resize', scheduleFitLabels);
  // タブを閉じる・切り替える直前に保存待ちを書き込む
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) flushSave();
  });
  window.addEventListener('pagehide', () => { if (saveTimer) flushSave(); });
}

start();
