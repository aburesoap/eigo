# eigo — ローカル完結型の英語学習ブラウザ拡張機能

[English](README.md) | 日本語

Web ページの英文を解析して、**知らない単語に下線**を引き、**既知語率**を表示し、気になった単語を**例文ごと保存**して **FSRS で復習**できる Chrome 拡張機能です（Firefox にも対応）。

- 外部サーバー・有料 API・アカウント登録は使いません。処理はすべてブラウザの中で行います
- 計測・テレメトリはありません。データはこのブラウザの中（IndexedDB と `storage.local`）にだけ保存します
- MIT ライセンスです。同梱しているデータとライブラリも、すべて MIT と両立するライセンスです

## 機能

| 機能 | 内容 |
|---|---|
| 下線表示 | 本文の英単語を見出し語にそろえ（running → run）、既知語リストにない語に赤い下線を引きます。固有名詞・頭字語・数字・URL・メールアドレス・コード・入力欄は対象外です。動的に追加された要素にも対応します |
| 既知語率メーター | ツールバーのバッジに既知語率を表示します（98% 以上は緑「快適」、95〜98% は黄「辞書少し」、95% 未満は赤「難しい」）。ポップアップには総語数・異なり語数・未知語の上位リストを表示します |
| サイトごとの ON/OFF | ポップアップの「このサイトで有効」で切り替えます |
| 単語ポップオーバー | 下線の語をクリック（リンク内は **Alt＋クリック**）すると、意味と例文が表示されます。［知ってる］［保存］［無視］はキーボードの **K / S / I** でも押せます |
| カード保存 | 見出し語・元の語形・その語を含む1文・URL・ページタイトル・保存日時・辞書の意味を保存します。保存した語は青い点線で表示します |
| 復習（SRS） | 例文の穴埋め → 裏面で意味・例文全体・出典リンクを表示します。Again / Hard / Good / Easy（**1〜4** キー）の評価で、FSRS が次回の出題日を決めます。1日の新規枚数と復習枚数に上限を設定できます |
| 自動昇格 | Good / Easy が設定回数（既定は5回）続いたカードの単語を、既知語リストへ自動で移します（Again で回数は 0 に戻ります） |
| カード一覧 | 検索・並べ替え・編集・削除ができます |
| 初期設定 | 初回起動時に、頻出語の上位 N 語（1,000〜10,000）を既知語として登録します |
| バックアップ | JSON でエクスポート／インポートできます（マージ・置き換えを選択）。既知語はテキスト（1行1語）で一括インポートもできます |

## インストール（ソースからビルド）

必要なもの：Node.js 20 以上

```bash
git clone <このリポジトリ>
cd eigo
npm ci
npm run build            # Chrome 用 → .output/chrome-mv3/
npm run build:firefox    # Firefox 用 → .output/firefox-mv3/
```

### Chrome に読み込む

1. `chrome://extensions` を開く
2. 右上の「デベロッパー モード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」を押し、`.output/chrome-mv3` フォルダを選ぶ
4. 初期設定のタブが自動で開くので、既知語の数（おすすめは 5,000 語）を選んで「この設定で始める」を押す
5. ツールバーのパズルアイコンから eigo をピン留めしておくと、バッジが見やすくなります

更新するとき：`npm run build` をもう一度実行し、`chrome://extensions` で eigo の「再読み込み」ボタン（↻）を押します。開いているページは再読み込みしてください。

### Firefox に読み込む（140 以上）

1. `about:debugging#/runtime/this-firefox` を開く
2. 「一時的なアドオンを読み込む」で `.output/firefox-mv3/manifest.json` を選ぶ
3. Firefox の MV3 では、サイトへのアクセス権が既定でオフです。`about:addons` → eigo → 「権限」で「すべてのウェブサイトのデータへのアクセス」をオンにしてください

## 動作確認の方法

1. 英語のページ（例：英語版 Wikipedia の記事）を開くと、知らない単語に赤い下線が引かれ、ツールバーのバッジに既知語率（例：`96`）が出ます
2. ツールバーのアイコンを押すと、既知語率・総語数・異なり語数・未知語の上位リストが見られます。リストの［知ってる］を押すと、ページの下線がすぐに消えます
3. 下線の単語をクリックすると、意味が表示されます
   - ［保存］（S）：下線が青い点線に変わります
   - ［知ってる］（K）：同じ語の下線がページ全体から消えます
   - ［無視］（I）：下線が消え、既知語率の計算からも外れます
4. ポップアップの「復習する」を押すと学習ページが開きます。Space で答えを表示し、1〜4 で評価します
5. 「カード一覧」で検索・編集・削除ができます
6. 設定ページの「JSON をエクスポート」でバックアップを保存し、「インポート」で戻せることを確認します

## 開発

```bash
npm run dev          # 開発用ブラウザが立ち上がり、変更が自動で反映されます
npm test             # 単体テスト（Vitest）。判定ロジックは src/core/ の純粋関数です
npm run compile      # 型チェック
npm run e2e          # ビルドしてから、Playwright で実際の Chromium を使った E2E テストを実行します
```

- 構成とデータモデル：[docs/DESIGN.md](docs/DESIGN.md)
- 同梱データの再生成：`npm run fetch:data && npm run build:data`（`data-src/` にダウンロードし、`public/data/*.json` を生成します）

### ディレクトリ

```
src/core/         判定ロジック（純粋関数・単体テストの対象）
src/sources/      テキストの取得元（今回は Web ページ。将来は YouTube 字幕を追加できます）
src/content/      ハイライトとポップオーバー（content script 側）
src/background/   辞書・見出し語化・DB 操作（background）
src/db/           IndexedDB（Dexie）のスキーマとクエリ
src/entrypoints/  background / content / popup / study / options
public/data/      同梱データ（生成物）
scripts/          データ生成スクリプト
tests/            単体テストと E2E テスト
```

## プライバシー

- ネットワーク通信は一切しません（同梱データの読み込みも拡張機能の中で完結します）
- ページの本文は、解析のためにそのタブの中と拡張機能の background の間でだけやり取りします。保存するのは、カードとして保存した1文・URL・タイトルだけです
- 拡張機能を削除すると、データもすべて削除されます。事前にエクスポートしておいてください

## 使用データ・ライブラリのライセンス

詳細と全文は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) にあります（拡張機能のパッケージにも同梱しています）。

| 名前 | ライセンス | 用途 |
|---|---|---|
| [EJDict-hand](https://github.com/kujirahand/EJDict) | CC0 1.0（パブリックドメイン） | 英和辞書 |
| [wikipedia-word-frequency](https://github.com/IlyaSemenov/wikipedia-word-frequency)（enwiki 2023-04-13） | MIT | 頻出語リスト |
| [wink-lemmatizer](https://github.com/winkjs/wink-lemmatizer) / wink-lexicon | MIT（WordNet 3.0 由来のデータは WordNet License） | 見出し語化 |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | FSRS |
| [Dexie.js](https://github.com/dexie/Dexie.js) | Apache-2.0 | IndexedDB |
| [Preact](https://github.com/preactjs/preact) | MIT | UI |

頻出語リストは英語版 Wikipedia をもとにしているため、百科事典によく出る語（`county`、`species` など）が上位に来やすくなっています。自分の単語リストを使いたい場合は、設定ページの「既知語リストの一括インポート」から読み込めます。

## ライセンス

[MIT](LICENSE)
