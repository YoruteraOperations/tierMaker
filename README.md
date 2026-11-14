# Tier表メーカー

画像を読み込んで、ドラッグで Tier に振り分けるツール。PC・スマホ両対応。
データはブラウザ内(IndexedDB)にだけ保存され、サーバーには送られない。

## 使い方

- **画像を追加**:ボタンから複数選択、ページへのドロップ、Ctrl+V の貼り付け。追加した画像は「未分類」に入る
- **移動**:画像をドラッグ。スマホは少し長押ししてから動かす
- **削除**:ドラッグ中に下に出るゴミ箱へ置く。または画像をクリックして Delete キーか右上の × ボタン
- **行の名前**:ラベルをクリックして編集。Enter で改行、枠の外をクリックか Ctrl+Enter で確定、Esc で取り消し
- **行の色・追加・削除**:行の右の歯車
- **行の並び替え**:行の右端のつまみをドラッグ
- **PNG保存**:Tier 部分(未分類は除く)を画像で保存
- **データ保存 / データ読み込み**:すべての表と画像を1つの JSON ファイルに保存。読み込み時は「追加」か「置き換え」を選ぶ。他の人との共有もこのファイルで行う
- **表の切り替え**:タイトル横の選択欄。横の ∨ から新規作成・名前変更・削除

## 手元での起動

ES Modules を使っているので、HTML をダブルクリックで開くのではなく簡易サーバー経由で開く。

```bash
cd tierMaker
python -m http.server 8000
```

ブラウザで http://localhost:8000/ を開く。

GitHub Pages と同じサブパスで確認したい場合は、一つ上のフォルダで起動して http://localhost:8000/tierMaker/ を開く。

```bash
python -m http.server 8000 --directory ..
```

## GitHub Pages での公開

1. GitHub で新しいリポジトリを作る(例:`tierMaker`、Public)。README などは追加しない
2. このフォルダでリモートを登録してプッシュする

   ```bash
   git remote add origin https://github.com/ユーザー名/tierMaker.git
   git branch -M main
   git push -u origin main
   ```

3. リポジトリの Settings > Pages を開く
4. Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして Save
5. 数分後に https://ユーザー名.github.io/tierMaker/ で開ける

パスはすべて相対パスなので、リポジトリ名を変えてもそのまま動く。

## 注意

- データは使っているブラウザ・端末ごとに別々。ブラウザのサイトデータを消すと消える。残したいものは「データ保存」でファイルにしておく
- プライベートブラウズでは保存されないことがある
- サンプル画像は入っていない

## 外部ライブラリ

| ファイル | ライブラリ | バージョン | ライセンス |
| --- | --- | --- | --- |
| `lib/Sortable.esm.js` | [SortableJS](https://github.com/SortableJS/Sortable) | 1.15.6 | MIT(`lib/Sortable.LICENSE.txt`) |

## ファイル構成

```
index.html
css/   base.css(変数・全体)/ tier.css / components.css / responsive.css
js/    main.js / state.js / storage.js / render.js / dragdrop.js / upload.js / tierEditor.js / exporter.js / text.js
lib/   Sortable.esm.js, Sortable.LICENSE.txt
assets/favicon.svg
```

修正の手引きは `CLAUDE.md`。
