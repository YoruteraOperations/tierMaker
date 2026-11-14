// Tierの追加・削除・名称・色・並び替え(並び替えのドラッグ自体は dragdrop.js)と、表の作成・名前変更・削除・切り替え。

import { TEXT } from './text.js';
import {
  getActiveList, getTier, makeList, addList, renameList, deleteList,
  addTier, deleteTier, clearTier, renameTier, setTierColor,
} from './state.js';
import { openDialog, showToast, fitLabel, cssVar } from './render.js';

const DEFAULT_TIER_VARS = ['--tier-1', '--tier-2', '--tier-3', '--tier-4', '--tier-5'];
const PRESET_COUNT = 12;
const FALLBACK_COLOR = '#cccccc';

// ---- 色(値は base.css の :root が正) ----

function normalizeHex(value) {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : FALLBACK_COLOR;
}

function presetColors() {
  return Array.from({ length: PRESET_COUNT }, (_, i) => normalizeHex(cssVar(`--preset-${i + 1}`)));
}

function newTierColor() {
  return normalizeHex(cssVar('--tier-new'));
}

// 初期状態の表(S / A / B / C / D)
export function makeDefaultList(name) {
  const tiers = TEXT.defaultTierLabels.map((label, i) => ({
    label,
    color: normalizeHex(cssVar(DEFAULT_TIER_VARS[i % DEFAULT_TIER_VARS.length])),
  }));
  return makeList(name, tiers);
}

export function nextListName(lists) {
  const names = new Set(lists.map((l) => l.name));
  let n = lists.length + 1;
  while (names.has(TEXT.listName(n))) n++;
  return TEXT.listName(n);
}

// ---- 行 ----

export function addTierAt(index) {
  return addTier(index, TEXT.newTierLabel, newTierColor());
}

// ラベルの直接編集。Enter は改行、フォーカスが外れるか Ctrl+Enter で確定、Esc で取り消し
export function beginLabelEdit(tierId, textEl) {
  if (textEl.isContentEditable) return;
  const tier = getTier(tierId);
  if (!tier) return;
  const before = tier.label;

  textEl.contentEditable = 'plaintext-only';
  if (textEl.contentEditable !== 'plaintext-only') textEl.contentEditable = 'true';
  textEl.spellcheck = false;
  textEl.focus();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const onInput = () => fitLabel(textEl);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finish(true);
    }
  };
  // contenteditable="true" の環境では書式付きで貼り付けられるので文字だけにする
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text/plain');
    if (text == null || e.clipboardData.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    document.execCommand('insertText', false, text);
  };
  const onBlur = () => finish(true);

  let finished = false;
  function finish(commit) {
    if (finished) return;
    finished = true;
    textEl.removeEventListener('input', onInput);
    textEl.removeEventListener('keydown', onKey);
    textEl.removeEventListener('paste', onPaste);
    textEl.removeEventListener('blur', onBlur);
    const value = commit ? textEl.innerText.replace(/\r/g, '').replace(/\n+$/, '') : before;
    textEl.contentEditable = 'false';
    textEl.removeAttribute('contenteditable');
    textEl.textContent = value;
    renameTier(tierId, value);
    fitLabel(textEl);
    if (document.activeElement === textEl) textEl.blur();
  }

  textEl.addEventListener('input', onInput);
  textEl.addEventListener('keydown', onKey);
  textEl.addEventListener('paste', onPaste);
  textEl.addEventListener('blur', onBlur);
}

// 行の設定(色・行の追加・未分類へ戻す・削除)
export function openTierSettings(tierId) {
  const tier = getTier(tierId);
  if (!tier) return;

  openDialog({
    title: tier.label || TEXT.tierSettings,
    buttons: [{ label: TEXT.close, value: null }],
    content: (close) => {
      const wrap = document.createElement('div');
      wrap.className = 'tier-settings';

      // 色
      const colorBlock = document.createElement('div');
      const colorLabel = document.createElement('div');
      colorLabel.className = 'field-label';
      colorLabel.textContent = TEXT.color;
      const colorRow = document.createElement('div');
      colorRow.className = 'color-row';

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.className = 'color-input';
      picker.value = tier.color;
      picker.setAttribute('aria-label', TEXT.colorPicker);
      picker.title = TEXT.colorPicker;
      colorRow.append(picker);

      const swatches = presetColors().map((color) => {
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'swatch';
        s.style.background = color;
        s.dataset.color = color;
        s.setAttribute('aria-label', color);
        s.title = color;
        s.addEventListener('click', () => applyColor(color));
        return s;
      });
      colorRow.append(...swatches);

      const markCurrent = (color) => {
        for (const s of swatches) s.classList.toggle('is-current', s.dataset.color === color);
      };
      const applyColor = (color) => {
        setTierColor(tierId, color);
        picker.value = color;
        markCurrent(color);
      };
      picker.addEventListener('input', () => applyColor(picker.value));
      markCurrent(tier.color.toLowerCase());

      colorBlock.append(colorLabel, colorRow);

      // 操作
      const actions = document.createElement('div');
      actions.className = 'action-list';
      const action = (label, fn, extra = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn ${extra}`.trim();
        b.textContent = label;
        b.addEventListener('click', () => { fn(); close(null); });
        actions.append(b);
      };
      const indexOf = () => getActiveList().tiers.findIndex((t) => t.id === tierId);
      action(TEXT.addRowAbove, () => addTierAt(indexOf()));
      action(TEXT.addRowBelow, () => addTierAt(indexOf() + 1));
      action(TEXT.clearRow, () => clearTier(tierId), 'is-wide');
      action(TEXT.deleteRow, () => deleteTier(tierId), 'is-danger is-wide');

      wrap.append(colorBlock, actions);
      return wrap;
    },
  });
}

// ---- 表 ----

export async function createListInteractive(lists) {
  const res = await openDialog({
    title: TEXT.listNameTitle,
    input: { value: nextListName(lists) },
    buttons: [{ label: TEXT.cancel, value: false }, { label: TEXT.ok, value: true, kind: 'primary' }],
    cancelValue: false,
  });
  if (!res.value) return;
  addList(makeDefaultList(res.text.trim() || nextListName(lists)));
}

export async function renameActiveListInteractive() {
  const list = getActiveList();
  const res = await openDialog({
    title: TEXT.listNameTitle,
    input: { value: list.name },
    buttons: [{ label: TEXT.cancel, value: false }, { label: TEXT.ok, value: true, kind: 'primary' }],
    cancelValue: false,
  });
  if (!res.value) return;
  const name = res.text.trim();
  if (name) renameList(list.id, name);
}

export async function deleteActiveListInteractive() {
  const list = getActiveList();
  const ok = await openDialog({
    message: TEXT.confirmDeleteList(list.name),
    buttons: [{ label: TEXT.cancel, value: false }, { label: TEXT.delete, value: true, kind: 'danger' }],
    cancelValue: false,
  });
  if (!ok) return;
  deleteList(list.id, makeDefaultList(TEXT.listName(1)));
  showToast(TEXT.listDeleted);
}
