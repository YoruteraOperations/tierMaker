// 状態→DOMの描画。Tier行と画像の要素はIDごとに使い回し、並び順だけを状態に合わせて入れ替える。
// トースト・ダイアログなど、画面に出す部品の生成もここにまとめている。

import { TEXT } from './text.js';
import { getActiveList, getState, getUi, getItemUrl } from './state.js';
import { bindItemList, bindTierList, initTrash } from './dragdrop.js';

const LABEL_FONT_MIN_PX = 9;
const TOAST_MS = 2000;
const LUMA_THRESHOLD = 0.55;   // 背景の明るさがこれより大きければ黒文字

const SVG_ATTR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const ICONS = {
  gear: `<svg ${SVG_ATTR} width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="7"/></svg>`,
  grip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  close: `<svg ${SVG_ATTR} width="14" height="14"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

const dom = {};
const tierEls = new Map();   // tierId → { row, label, text, items, sortable }
const itemEls = new Map();   // itemId → 要素
let selectedEl = null;
let listSignature = '';
let fitScheduled = false;

// ---- 初期化 ----

export function initRender() {
  dom.board = document.getElementById('board');
  dom.unsorted = document.getElementById('unsorted');
  dom.listSelect = document.getElementById('list-select');
  dom.toasts = document.getElementById('toasts');
  dom.unsorted.dataset.empty = TEXT.unsortedEmpty;
  bindTierList(dom.board);
  bindItemList(dom.unsorted);
  initTrash(document.getElementById('trash'));
}

// ---- 描画 ----

export function render() {
  const list = getActiveList();
  if (!list) return;
  renderListSelect();

  // Tier行
  const seen = new Set();
  list.tiers.forEach((tier, i) => {
    let te = tierEls.get(tier.id);
    if (!te) {
      te = createTierRow(tier.id);
      tierEls.set(tier.id, te);
    }
    seen.add(tier.id);
    updateTierRow(te, tier);
    const ref = dom.board.children[i];
    if (ref !== te.row) dom.board.insertBefore(te.row, ref || null);
  });
  for (const [id, te] of tierEls) {
    if (seen.has(id)) continue;
    te.sortable.destroy();
    te.row.remove();
    tierEls.delete(id);
  }

  // 画像
  const live = new Set();
  for (const tier of list.tiers) syncItems(tierEls.get(tier.id).items, tier.itemIds, live);
  syncItems(dom.unsorted, list.unsorted, live);
  for (const [id, el] of itemEls) {
    if (live.has(id)) continue;
    el.remove();
    itemEls.delete(id);
  }

  // 選択状態
  const selId = getUi().selectedItemId;
  const nextSel = selId ? itemEls.get(selId) || null : null;
  if (selectedEl !== nextSel) {
    selectedEl?.classList.remove('is-selected');
    nextSel?.classList.add('is-selected');
    selectedEl = nextSel;
  }

  scheduleFitLabels();
}

function renderListSelect() {
  const { lists, activeListId } = getState();
  const sig = lists.map((l) => `${l.id}:${l.name}`).join('\n');
  if (sig !== listSignature) {
    listSignature = sig;
    dom.listSelect.replaceChildren(...lists.map((l) => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      return opt;
    }));
  }
  dom.listSelect.value = activeListId;
}

function createTierRow(tierId) {
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.dataset.tierId = tierId;

  const label = document.createElement('div');
  label.className = 'tier-label';
  label.dataset.action = 'edit-label';
  label.title = TEXT.editLabel;
  const box = document.createElement('div');
  box.className = 'tier-label-box';
  const text = document.createElement('span');
  text.className = 'tier-label-text';
  box.append(text);
  label.append(box);

  const items = document.createElement('div');
  items.className = 'item-list tier-items';
  items.dataset.container = tierId;

  const controls = document.createElement('div');
  controls.className = 'tier-controls';
  const gear = iconButton('gear', TEXT.tierSettings);
  gear.dataset.action = 'tier-settings';
  gear.dataset.tierId = tierId;
  const handle = iconButton('grip', TEXT.dragRow);
  handle.classList.add('tier-handle');
  controls.append(gear, handle);

  row.append(label, items, controls);
  return { row, label, text, items, sortable: bindItemList(items), lastLabel: null, lastColor: null };
}

function updateTierRow(te, tier) {
  if (te.lastColor !== tier.color) {
    te.label.style.background = tier.color;
    te.label.style.color = labelTextColor(tier.color);
    te.lastColor = tier.color;
  }
  // 編集中は上書きしない
  if (te.lastLabel !== tier.label && !te.text.isContentEditable) {
    te.text.textContent = tier.label;
    te.lastLabel = tier.label;
  }
}

function iconButton(icon, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.innerHTML = ICONS[icon];
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

function getItemEl(id) {
  let el = itemEls.get(id);
  if (el) return el;
  const item = getState().items[id];
  const url = getItemUrl(id);
  if (!item || !url) return null;
  el = document.createElement('div');
  el.className = 'item';
  el.dataset.itemId = id;
  el.title = item.name;
  const img = document.createElement('img');
  img.src = url;
  img.alt = item.name;
  img.draggable = false;
  img.decoding = 'async';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'item-del';
  del.dataset.action = 'delete-item';
  del.setAttribute('aria-label', TEXT.deleteImage);
  del.title = TEXT.deleteImage;
  del.innerHTML = ICONS.close;
  el.append(img, del);
  itemEls.set(id, el);
  return el;
}

// container の子要素を ids の順に並べ替える。余った要素は外す(別の場所で再配置される)
function syncItems(container, ids, live) {
  let idx = 0;
  for (const id of ids) {
    const el = getItemEl(id);
    if (!el) continue;
    live.add(id);
    const ref = container.children[idx];
    if (ref !== el) container.insertBefore(el, ref || null);
    idx++;
  }
  while (container.children.length > idx) container.lastElementChild.remove();
}

// ---- ラベル文字の自動縮小 ----

export function scheduleFitLabels() {
  if (fitScheduled) return;
  fitScheduled = true;
  requestAnimationFrame(() => {
    fitScheduled = false;
    for (const te of tierEls.values()) fitLabel(te.text);
  });
}

export function fitLabel(textEl) {
  const box = textEl.parentElement;
  const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label-font')) || 20;
  let size = base;
  textEl.style.fontSize = `${size}px`;
  while (size > LABEL_FONT_MIN_PX && (textEl.scrollHeight > box.clientHeight || textEl.scrollWidth > box.clientWidth)) {
    size -= 1;
    textEl.style.fontSize = `${size}px`;
  }
}

// 背景色の明るさから白か黒を選ぶ
export function labelTextColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 'var(--label-text-dark)';
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16) / 255);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > LUMA_THRESHOLD ? 'var(--label-text-dark)' : 'var(--label-text-light)';
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- トースト ----

export function showToast(message, { sticky = false } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  dom.toasts.append(el);
  let timer = sticky ? null : setTimeout(close, TOAST_MS);
  function close() {
    clearTimeout(timer);
    el.remove();
  }
  return {
    update(text) { el.textContent = text; },
    close,
    closeLater() { clearTimeout(timer); timer = setTimeout(close, TOAST_MS); },
  };
}

// ---- ダイアログ ----

// buttons: [{ label, value, kind: 'primary' | 'danger' }]
// content: (close) => Node で任意の中身を入れられる
// input: { value } を渡すと1行入力欄を出し、{ value: ボタンの値, text: 入力値 } を返す
export function openDialog({ title, message, content, input, buttons, cancelValue = null }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    overlay.append(box);

    let inputEl = null;
    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
      resolve(input ? { value, text: inputEl.value } : value);
    };

    if (title) {
      const h = document.createElement('h2');
      h.className = 'modal-title';
      h.textContent = title;
      box.setAttribute('aria-label', title);
      box.append(h);
    }
    if (message) {
      const p = document.createElement('p');
      p.className = 'modal-message';
      p.textContent = message;
      box.append(p);
    }
    if (content) box.append(content(close));
    if (input) {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'modal-input';
      inputEl.value = input.value || '';
      box.append(inputEl);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'modal-buttons';
    const btnList = buttons || [{ label: TEXT.ok, value: true, kind: 'primary' }];
    let primary = null;
    for (const b of btnList) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn${b.kind ? ` is-${b.kind}` : ''}`;
      el.textContent = b.label;
      el.addEventListener('click', () => close(b.value));
      // 確認系(danger)は誤操作を避けるため初期フォーカスを当てない
      if (b.kind === 'primary') primary = { el, value: b.value };
      btnRow.append(el);
    }
    box.append(btnRow);

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(cancelValue);
      } else if (e.key === 'Enter' && inputEl && e.target === inputEl && !e.isComposing) {
        e.preventDefault();
        close(primary ? primary.value : true);
      }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(cancelValue); });

    document.body.append(overlay);
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    } else {
      (primary?.el || btnRow.firstElementChild)?.focus();
    }
  });
}

export function isDialogOpen() {
  return !!document.querySelector('.modal-overlay');
}
