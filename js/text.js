// 画面に出る文言をすべてここにまとめる。文言を直すときはこのファイルだけ触ればよい。
// HTML側は data-t(本文)/ data-t-aria(aria-label と title)にキー名を書くと main.js が差し込む。

export const TEXT = {
  appTitle: 'Tier表メーカー',

  // ツールバー
  addImages: '画像を追加',
  addTier: '行を追加',
  imageSize: 'サイズ',
  exportPng: 'PNG保存',
  exportData: 'データ保存',
  importData: 'データ読み込み',
  reset: 'リセット',
  more: 'メニュー',

  // 表の切り替え
  listSelect: '表の切り替え',
  listMenu: '表の操作',
  newList: '新しい表',
  renameList: '名前を変更',
  deleteList: 'この表を削除',
  listName: (n) => `表${n}`,
  listNameTitle: '表の名前',

  // 盤面
  unsorted: '未分類',
  unsortedEmpty: '画像をドロップ、またはクリックして追加',
  trash: 'ここに置くと削除',
  dropHere: 'ドロップして追加',
  deleteImage: '画像を削除',
  tierSettings: '行の設定',
  dragRow: '行を移動',
  editLabel: '名前を編集',

  // Tier
  defaultTierLabels: ['S', 'A', 'B', 'C', 'D'],
  newTierLabel: '新規',
  color: '色',
  colorPicker: '色を選ぶ',
  addRowAbove: '上に行を追加',
  addRowBelow: '下に行を追加',
  clearRow: '画像を未分類に戻す',
  deleteRow: 'この行を削除',

  // ダイアログ
  ok: 'OK',
  cancel: 'キャンセル',
  close: '閉じる',
  delete: '削除',
  confirmReset: 'すべて削除します。元に戻せません。',
  confirmDeleteList: (name) => `「${name}」を削除します。元に戻せません。`,
  importTitle: 'データ読み込み',
  importMessage: '今のデータに追加するか、置き換えるかを選んでください。',
  importAdd: '追加',
  importReplace: '置き換え',

  // トースト
  progress: (done, total) => `${done} / ${total}`,
  added: (n) => `${n}枚追加しました`,
  addFailed: (n) => `${n}枚は追加できませんでした`,
  notImage: '画像ファイルではありません',
  saved: '保存しました',
  pngSaved: 'PNGを保存しました',
  pngFailed: 'PNGを作成できませんでした',
  loaded: '読み込みました',
  loadFailed: '読み込めませんでした',
  resetDone: 'リセットしました',
  saveFailed: 'ブラウザへの保存に失敗しました',
  listDeleted: '削除しました',
};
