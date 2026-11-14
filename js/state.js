// アプリの状態管理。データの正はここだけで、変更は必ずここの関数を通す。
// 変更のたびに購読者(描画・自動保存)へ通知する。画像の ObjectURL もここで管理する。

import { deleteBlob } from './storage.js';

export const UNSORTED = 'unsorted';

let state = { lists: [], activeListId: null, items: {} };
const ui = { selectedItemId: null };
const itemUrls = new Map();
const listeners = new Set();

// ---- 基本 ----

export function newId(prefix) {
  const raw = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`)
    .replace(/[^0-9a-z]/gi, '');
  return `${prefix}_${raw.slice(0, 16)}`;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// persist=false は保存不要な変更(選択状態など)
function notify(persist = true) {
  for (const fn of listeners) fn({ persist });
}

export function getState() {
  return state;
}

export function getUi() {
  return ui;
}

export function getActiveList() {
  return state.lists.find((l) => l.id === state.activeListId) || state.lists[0];
}

export function getItemUrl(id) {
  return itemUrls.get(id);
}

// 保存用に、ObjectURL など実行時だけの情報を除いた複製を返す
export function serializeState() {
  return JSON.parse(JSON.stringify(state));
}

function findTier(tierId) {
  for (const list of state.lists) {
    const tier = list.tiers.find((t) => t.id === tierId);
    if (tier) return { list, tier };
  }
  return null;
}

export function getTier(tierId) {
  const found = findTier(tierId);
  return found ? found.tier : null;
}

// 画像IDを、それが入っている配列から取り除く
function detachItem(itemId) {
  for (const list of state.lists) {
    for (const tier of list.tiers) {
      const i = tier.itemIds.indexOf(itemId);
      if (i >= 0) { tier.itemIds.splice(i, 1); return; }
    }
    const i = list.unsorted.indexOf(itemId);
    if (i >= 0) { list.unsorted.splice(i, 1); return; }
  }
}

function listItemIds(list) {
  return [...list.unsorted, ...list.tiers.flatMap((t) => t.itemIds)];
}

function setItemBlob(id, blob) {
  const old = itemUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  itemUrls.set(id, URL.createObjectURL(blob));
}

function revokeAllUrls() {
  for (const url of itemUrls.values()) URL.revokeObjectURL(url);
  itemUrls.clear();
}

// ---- 表(リスト) ----

// tiers は [{ label, color }] の形で受け取る
export function makeList(name, tiers) {
  return {
    id: newId('list'),
    name,
    tiers: tiers.map((t) => ({ id: newId('tier'), label: t.label, color: t.color, itemIds: [] })),
    unsorted: [],
  };
}

export function addList(list) {
  state.lists.push(list);
  state.activeListId = list.id;
  ui.selectedItemId = null;
  notify();
}

export function switchList(listId) {
  if (!state.lists.some((l) => l.id === listId)) return;
  state.activeListId = listId;
  ui.selectedItemId = null;
  notify();
}

export function renameList(listId, name) {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;
  list.name = name;
  notify();
}

// 表を削除し、その表の画像も消す。最後の1つを消した場合は fallbackList に置き換える
export function deleteList(listId, fallbackList) {
  const idx = state.lists.findIndex((l) => l.id === listId);
  if (idx < 0) return;
  const [list] = state.lists.splice(idx, 1);
  for (const id of listItemIds(list)) removeItemRecord(id);
  if (state.lists.length === 0) state.lists.push(fallbackList);
  const next = state.lists[Math.min(idx, state.lists.length - 1)];
  state.activeListId = next.id;
  ui.selectedItemId = null;
  notify();
}

// ---- 画像 ----

export function addItem(item, blob) {
  state.items[item.id] = item;
  setItemBlob(item.id, blob);
  getActiveList().unsorted.push(item.id);
  notify();
}

function removeItemRecord(id) {
  delete state.items[id];
  const url = itemUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  itemUrls.delete(id);
  if (ui.selectedItemId === id) ui.selectedItemId = null;
  deleteBlob(id).catch((err) => console.error(err));
}

export function deleteItem(id) {
  if (!state.items[id]) return;
  detachItem(id);
  removeItemRecord(id);
  notify();
}

export function selectItem(id) {
  ui.selectedItemId = id && state.items[id] ? id : null;
  notify(false);
}

// ドラッグ後の並び順を反映する。orders は { [containerId]: [itemId, ...] }
export function setContainerOrders(orders) {
  const list = getActiveList();
  for (const [containerId, ids] of Object.entries(orders)) {
    const valid = ids.filter((id) => state.items[id]);
    if (containerId === UNSORTED) {
      list.unsorted = valid;
    } else {
      const tier = list.tiers.find((t) => t.id === containerId);
      if (tier) tier.itemIds = valid;
    }
  }
  notify();
}

// ---- Tier ----

export function addTier(index, label, color) {
  const list = getActiveList();
  const tier = { id: newId('tier'), label, color, itemIds: [] };
  const at = index == null ? list.tiers.length : Math.max(0, Math.min(index, list.tiers.length));
  list.tiers.splice(at, 0, tier);
  notify();
  return tier;
}

export function deleteTier(tierId) {
  const found = findTier(tierId);
  if (!found) return;
  const { list, tier } = found;
  list.unsorted.push(...tier.itemIds);
  list.tiers = list.tiers.filter((t) => t.id !== tierId);
  notify();
}

export function clearTier(tierId) {
  const found = findTier(tierId);
  if (!found) return;
  found.list.unsorted.push(...found.tier.itemIds);
  found.tier.itemIds = [];
  notify();
}

export function renameTier(tierId, label) {
  const found = findTier(tierId);
  if (!found) return;
  found.tier.label = label;
  notify();
}

export function setTierColor(tierId, color) {
  const found = findTier(tierId);
  if (!found) return;
  found.tier.color = color;
  notify();
}

export function reorderTiers(tierIds) {
  const list = getActiveList();
  const byId = new Map(list.tiers.map((t) => [t.id, t]));
  const ordered = tierIds.map((id) => byId.get(id)).filter(Boolean);
  // 念のため、DOMに無かった行は末尾に残す
  for (const t of list.tiers) if (!ordered.includes(t)) ordered.push(t);
  list.tiers = ordered;
  notify();
}

// ---- 全体の入れ替え ----

// 保存データを検査して整える。参照の重複・欠落を取り除く
export function normalizeState(raw, hasBlob) {
  if (!raw || !Array.isArray(raw.lists) || typeof raw.items !== 'object' || raw.items === null) return null;
  const items = {};
  const used = new Set();
  const takeIds = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => {
    const it = raw.items[id];
    if (!it || used.has(id) || !hasBlob(id)) return false;
    used.add(id);
    items[id] = { id, name: String(it.name || ''), mime: String(it.mime || ''), blobKey: it.blobKey || id };
    return true;
  });
  const lists = raw.lists
    .filter((l) => l && Array.isArray(l.tiers))
    .map((l) => ({
      id: String(l.id || newId('list')),
      name: String(l.name ?? ''),
      tiers: l.tiers.map((t) => ({
        id: String(t.id || newId('tier')),
        label: String(t.label ?? ''),
        color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#cccccc',
        itemIds: takeIds(t.itemIds),
      })),
      unsorted: takeIds(l.unsorted),
    }));
  if (!lists.length) return null;
  const activeListId = lists.some((l) => l.id === raw.activeListId) ? raw.activeListId : lists[0].id;
  return { lists, activeListId, items };
}

// 状態を丸ごと置き換える。blobs は Map(itemId → Blob)
export function replaceAll(next, blobs = new Map()) {
  revokeAllUrls();
  state = next;
  ui.selectedItemId = null;
  for (const [id, blob] of blobs) if (state.items[id]) setItemBlob(id, blob);
  notify();
}

// 読み込んだ表を今の状態に追加する(ID は呼び出し側で振り直し済みのもの)
export function appendLists(lists, items, blobs) {
  Object.assign(state.items, items);
  for (const [id, blob] of blobs) setItemBlob(id, blob);
  state.lists.push(...lists);
  if (lists.length) state.activeListId = lists[0].id;
  ui.selectedItemId = null;
  notify();
}
