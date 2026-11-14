// SortableJS の初期化。ドラッグが終わったら DOM 上の並び順を読み取って state へ反映する。
// DOM を動かすのは SortableJS だが、反映後の描画は state の通知から render が行う。

import Sortable from '../lib/Sortable.esm.js';
import { setContainerOrders, deleteItem, reorderTiers } from './state.js';

const ANIMATION_MS = 120;
const TOUCH_DELAY_MS = 150;        // タッチ時だけドラッグ開始を遅らせ、スクロールと両立させる
const TOUCH_THRESHOLD_PX = 5;      // 遅延中にこれ以上指が動いたらスクロールとみなす
const FALLBACK_TOLERANCE_PX = 3;   // マウスでこれ未満の移動ならクリック扱い
const SCROLL_SENSITIVITY_PX = 70;  // 画面端からこの距離に入ると自動スクロール
const SCROLL_SPEED_PX = 16;
const CLICK_GUARD_MS = 300;        // ドラッグ直後のクリックを無視する時間

let trashEl = null;
let lastDragEndAt = 0;

const baseOptions = {
  animation: ANIMATION_MS,
  delay: TOUCH_DELAY_MS,
  delayOnTouchOnly: true,
  touchStartThreshold: TOUCH_THRESHOLD_PX,
  // マウス・タッチとも同じ動き(自前の追従表示)にそろえる。ページへのファイルドロップとも干渉しない
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: FALLBACK_TOLERANCE_PX,
  scroll: true,
  bubbleScroll: true,
  scrollSensitivity: SCROLL_SENSITIVITY_PX,
  scrollSpeed: SCROLL_SPEED_PX,
  ghostClass: 'is-ghost',
  chosenClass: 'is-chosen',
  fallbackClass: 'is-fallback',
};

function readItemIds(container) {
  return [...container.querySelectorAll(':scope > .item')].map((el) => el.dataset.itemId);
}

// 画像のドラッグ中は is-dragging(ゴミ箱が出る)、行のドラッグ中は is-dragging-row を body に付ける
function startDrag(cls) {
  document.body.classList.add(cls);
}

function endDrag(cls) {
  document.body.classList.remove(cls);
  lastDragEndAt = Date.now();
}

export function wasJustDragged() {
  return Date.now() - lastDragEndAt < CLICK_GUARD_MS;
}

// ゴミ箱。受け取るだけで、ここから取り出すことはできない
export function initTrash(el) {
  trashEl = el;
  Sortable.create(el, {
    ...baseOptions,
    group: { name: 'items', pull: false, put: true },
    draggable: '.item',
    sort: false,
  });
}

// 画像を並べるエリア(各Tier行・未分類)
export function bindItemList(el) {
  return Sortable.create(el, {
    ...baseOptions,
    group: { name: 'items', pull: true, put: true },
    draggable: '.item',
    filter: '.item-del',
    preventOnFilter: false,
    onStart: () => startDrag('is-dragging'),
    onEnd(evt) {
      endDrag('is-dragging');
      const id = evt.item.dataset.itemId;
      if (evt.to === trashEl) {
        evt.item.remove();
        deleteItem(id);
        return;
      }
      const orders = {};
      for (const c of new Set([evt.from, evt.to])) {
        orders[c.dataset.container] = readItemIds(c);
      }
      setContainerOrders(orders);
    },
  });
}

// Tier行の並び替え(右端のハンドルのみで掴む。ハンドルは専用なのでタッチでも遅延なし)
export function bindTierList(el) {
  return Sortable.create(el, {
    ...baseOptions,
    delay: 0,
    group: 'tiers',
    handle: '.tier-handle',
    draggable: '.tier-row',
    onStart: () => startDrag('is-dragging-row'),
    onEnd() {
      endDrag('is-dragging-row');
      reorderTiers([...el.children].map((row) => row.dataset.tierId));
    },
  });
}
