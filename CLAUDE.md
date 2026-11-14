# CLAUDE.md(修正用メモ)

素の HTML / CSS / JS(ES Modules)。ビルド・npm なし。GitHub Pages のサブパスで動かすため、パスは必ず相対パス(先頭に `/` を付けない)。

## 確認方法

```bash
python -m http.server 8000 --directory ..
```

http://localhost:8000/tierMaker/ を開く(サブパス確認を兼ねる)。

## データ構造(js/state.js が唯一の正)

```js
{
  lists: [{
    id, name,
    tiers: [{ id, label, color, itemIds: [] }],  // label は改行を含んでよい。color は #rrggbb
    unsorted: [],                                // 未分類の itemId
  }],
  activeListId,
  items: { [itemId]: { id, name, mime, blobKey } } // blobKey は今は itemId と同じ
}
```

- 1つの画像はどれか1つの表の1か所にだけ属する
- 実行時だけの情報(ObjectURL、選択中の画像)は state.js 内で別に持ち、保存しない
- 描画は「state の関数で変更 → 購読者へ通知 → render()」の一方向。DOM を正にしない
- ドラッグ後は SortableJS が動かした DOM の並びを読み取り、`setContainerOrders` で state に戻す

### 保存先

- IndexedDB `tier_maker`
  - `meta` ストア:キー `state` に上記の JSON(画像本体なし)。変更から300ms後に自動保存
  - `blobs` ストア:キー itemId → 元ファイルの Blob(画質そのまま)
- localStorage `tier_maker_item_size`:画像サイズのスライダー値(端末ごとの表示設定)
- 起動時に、Blob の無い画像は state から外し、どこからも参照されない Blob は削除する

### データファイル(データ保存 / 読み込み)

```json
{ "app": "tier_maker", "format": 1, "activeListId": "...", "lists": [...],
  "items": { "<itemId>": { "name": "...", "mime": "...", "data": "data:image/png;base64,..." } } }
```

読み込み時は ID をすべて振り直す(同じファイルを「追加」しても衝突しない)。形式を変えるときは `format` を上げ、古い形式も読めるようにする。

## ファイルごとの役割

| ファイル | 役割 |
| --- | --- |
| `index.html` | 骨組み。文言は書かず `data-t` / `data-t-aria` にキー名だけ書く |
| `css/base.css` | `:root` の変数(色・サイズ・余白・Tier初期色・プリセット色)、リセット、全体 |
| `css/tier.css` | Tier行、ラベル、画像の並び、ドラッグ中の見た目 |
| `css/components.css` | ボタン、ツールバー、メニュー、未分類、ゴミ箱、トースト、モーダル、行の設定 |
| `css/responsive.css` | 幅600px以下(と横向きの低い画面)の調整、「…」メニュー |
| `js/main.js` | 起動、保存データの復元、クリック・キー操作の振り分け、自動保存、サイズスライダー |
| `js/state.js` | 状態と変更関数、ObjectURL 管理、保存データの検査 (`normalizeState`) |
| `js/storage.js` | IndexedDB の読み書きのみ |
| `js/render.js` | state → DOM、ラベル文字の自動縮小、文字色の自動選択、トースト、ダイアログ |
| `js/dragdrop.js` | SortableJS の設定(画像・行・ゴミ箱) |
| `js/upload.js` | ファイル選択・ドロップ・貼り付けの取り込み、進捗表示 |
| `js/tierEditor.js` | 行の追加・削除・名前編集・色、行の設定ダイアログ、表の作成・名前変更・削除 |
| `js/exporter.js` | PNG 書き出し(画面の配置を読み取って Canvas に描画)、JSON の書き出し・読み込み |
| `js/text.js` | 画面に出る文言すべて |

## 〇〇を変えたいときはどこを触るか

| 変えたいこと | 場所 |
| --- | --- |
| 文言 | `js/text.js` のみ |
| 色・背景・線の色 | `css/base.css` の `:root` |
| 初期の S〜D の色 | `css/base.css` の `--tier-1`〜`--tier-5` |
| 初期の行の名前・数 | `js/text.js` の `defaultTierLabels`(色は `--tier-*` を順に使い、足りなければ繰り返す) |
| 行の設定に並ぶ色 | `css/base.css` の `--preset-1`〜`--preset-12`(数を変えたら `tierEditor.js` の `PRESET_COUNT` も) |
| 追加した行の色・名前 | `--tier-new` / `text.js` の `newTierLabel` |
| ラベル幅・画像サイズ・間隔 | `css/base.css` の `--label-w` `--item-size` `--item-gap`(スマホは `responsive.css`) |
| スライダーの範囲 | `index.html` の `size-range` の min/max と `main.js` の `ITEM_SIZE_MIN/MAX` |
| ラベル文字の大きさ・最小値 | `--label-font` / `render.js` の `LABEL_FONT_MIN_PX` |
| 文字色を白にする明るさの境目 | `render.js` の `LUMA_THRESHOLD` |
| スマホに切り替わる幅 | `css/responsive.css` の media query |
| タッチの長押し時間・自動スクロール | `js/dragdrop.js` の定数 |
| トーストの表示時間 | `render.js` の `TOAST_MS` |
| PNG の解像度 | `exporter.js` の `PNG_SCALE` |
| 自動保存の間隔 | `main.js` の `SAVE_DELAY_MS` |
| ボタンを増やす | `index.html` に `data-action` 付きで置き、`main.js` の `handleAction` に処理を足す |

## 文言・見た目のルール

- 短くそっけなく。ボタンは名詞か動詞だけ。絵文字・「！」・呼びかけ・宣伝調は使わない
- 確認ダイアログはリセットと表の削除だけ
- 角丸は小さめ(`--radius`)、グラデーション・光・影は使わない
- アイコンは単純な SVG(`render.js` の `ICONS` と `index.html` 内)

## 注意

- `lib/` にはライブラリだけを置き、README にバージョンとライセンスを書く
- `.claude/launch.json` は確認用サーバーの設定(git には含めない)
