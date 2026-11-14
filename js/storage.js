// IndexedDB の読み書き。状態(Tier構成・配置)は meta ストア、画像本体の Blob は blobs ストアに保存する。
// ここは保存と読み出しだけを行い、状態の中身は解釈しない。

const DB_NAME = 'tier_maker';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_BLOBS = 'blobs';
const STATE_KEY = 'state';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// 1回のトランザクションで処理する共通関数。fn には object store を渡す
async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function loadState() {
  return withStore(STORE_META, 'readonly', (s) => s.get(STATE_KEY));
}

export function saveState(data) {
  return withStore(STORE_META, 'readwrite', (s) => s.put(data, STATE_KEY));
}

export function putBlob(key, blob) {
  return withStore(STORE_BLOBS, 'readwrite', (s) => s.put(blob, key));
}

export function getBlob(key) {
  return withStore(STORE_BLOBS, 'readonly', (s) => s.get(key));
}

export function deleteBlob(key) {
  return withStore(STORE_BLOBS, 'readwrite', (s) => s.delete(key));
}

export function listBlobKeys() {
  return withStore(STORE_BLOBS, 'readonly', (s) => s.getAllKeys());
}

// すべてのデータを消す(リセット・置き換え読み込みで使う)
export async function clearAll() {
  await withStore(STORE_BLOBS, 'readwrite', (s) => s.clear());
  await withStore(STORE_META, 'readwrite', (s) => s.clear());
}

// ブラウザによる自動削除を避けるため、永続化をお願いしておく(断られても動作に影響はない)
export function requestPersist() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
