# 設計書（v0.1）

ローカル完結型の英語学習ブラウザ拡張機能の設計です。実装前の提案をもとに、実装時に変えた点を §0 にまとめています。

## 0. 実装時の変更点（提案からの差分）

| 項目 | 提案 | 実装 | 理由 |
|---|---|---|---|
| 辞書の置き場所 | IndexedDB に投入 | background がメモリに読み込む（`fetch` → `JSON.parse`、約 50ms） | 見出し語化の候補選びにも見出し語の集合が必要なため。初回の投入待ちもなくなる |
| 下線のスタイル | 波線 | 実線 2px（学習中は青い点線） | `::highlight` の波線は単語の切れ目で描画が崩れたため |
| 初期の既知語数 | 1000 / 3000 / 5000 | 0 / 1000 / 3000 / 5000 / 8000 / 10000（既定は 5000） | Wikipedia 由来のリストは日常語が下位に来やすい（`smell` が 6080 位） |
| 副詞 | — | `-ly` の副詞は、元の形容詞が既知なら既知扱い（slowly → slow） | 下線が多すぎる問題への対策 |
| ポップオーバー | ボタンのみ | K / S / I / Esc のキー操作を追加 | 操作の効率化と、closed Shadow DOM のままでの E2E テストのため |
| 初回起動 | — | 初期設定が終わるまで下線を表示しない | 全単語に下線が引かれるのを避けるため |
| 昇格したカード | — | 同じ見出し語のカードもまとめて「昇格済み」にし、復習の対象から外す（編集で戻せる） | 既知語になった語を復習し続けないため |
| 学習中ステップ | — | 他に出題がなければ、20分以内に期限が来る学習中のカードを先に出す（learn-ahead） | 短い間隔のステップで待たされないようにするため |


## 1. 技術スタック

| 用途 | 採用 | ライセンス | 理由 |
|---|---|---|---|
| 言語 | TypeScript | Apache-2.0 | 型でメッセージ・DBスキーマを守る |
| フレームワーク | WXT 0.21 + Vite | MIT | MV3対応、Chrome/Firefoxを同じコードからビルドできる。`browser.*` APIに統一される |
| UI | **Preact** 11 | MIT | 実行時サイズ約4KB。ポップアップ・学習ページ・ポップオーバーで共用。JSXなのでテストや型付けが素直 |
| DB | Dexie 4 (IndexedDB) | Apache-2.0 | インデックス・トランザクション・スキーマのマイグレーションがある |
| 見出し語化 | wink-lemmatizer 3 | MIT（WordNet由来データ。WordNetライセンスはBSD系） | 規則と例外表に基づく軽量な実装 |
| SRS | ts-fsrs 6 | MIT | FSRSの公式TS実装 |
| テスト | Vitest | MIT | Viteと設定を共有できる |
| 英和辞書 | EJDict-hand | CC0（パブリックドメイン） | 確認済み |
| 頻出語 | 下記 §6 | MIT | |

Svelteではなく **Preact** を提案します。ポップオーバーはShadow DOMの中で描画するため、ランタイムが小さく、CSSをコンポーネント側に閉じ込めやすい方が扱いやすいからです。

## 2. 重要な設計判断

### 2.1 IndexedDBはバックグラウンド側に置く
content scriptからIndexedDBを開くと、**閲覧中のサイトのオリジン**にデータが作られてしまいます。そのためDBは拡張機能のオリジン（background / 拡張ページ）だけが持ち、content scriptはメッセージ経由でアクセスします。

- content script → background：`classify(surfaces[])`、`lookup(lemma)`、`saveCard`、`markKnown` など（型付きのRPC）
- background → content script：既知語・無視語の変更をブロードキャストし、他のタブの下線も即座に更新する
- 設定とサイト別のON/OFFは `storage.local` に置く（小さく、content scriptから直接読めて、`onChanged` で変更を受け取れる）

### 2.2 下線は CSS Custom Highlight API で描く（DOMを書き換えない）
`<span>` で単語を包む方式は、ReactやVueなどのサイトのDOMを壊したり、レイアウトを崩したりする原因になります。そこで `Range` の集合を `CSS.highlights.set('eigo-unknown', new Highlight(...ranges))` に登録し、`::highlight(eigo-unknown) { text-decoration: underline wavy }` で描画します。

- ページのDOMやCSSに一切触れない。外すときもHighlightを消すだけ
- 「知ってる」を押したら、該当の見出し語に属するRangeを取り除くだけでよい
- クリックの判定：`click` イベントで `caretPositionFromPoint`（Chromeでは `caretRangeFromPoint`）を使ってクリック位置のオフセットを求め、未知語のRangeに含まれていればポップオーバーを出す
- 対応状況：Chrome 105+、Firefox 140+。非対応の環境ではspanで包む方式に切り替える（フォールバックは後回し可）
- リンク内の単語：普通のクリックはリンクの遷移を優先し、**Alt+クリック**でポップオーバーを出す。リンク外の単語は普通のクリックで出す。テキストを選択中（ドラッグ）のときは出さない

### 2.3 処理の分担
- **content script**：テキストの収集、トークン化、文の切り出し、Rangeの生成、ハイライト、ポップオーバー
- **background**：見出し語化と既知語の判定（wink-lemmatizerと既知語セットを1か所に持つ）、辞書の検索、DB、バッジ
- content scriptは**異なり語（小文字化した表層形）だけ**をまとめて送り、`{surface → {lemma, status}}` を受け取ってキャッシュする。1ページあたりのメッセージは数往復で済む
- 判定ロジックはすべて `src/core/` の純粋関数にまとめ、backgroundはそれを呼ぶだけにする

### 2.4 長いページへの対策
- `TreeWalker` でテキストノードを集め、`requestIdleCallback` で（1回あたりの予算を約8msとして）チャンクに分けて処理する
- `MutationObserver` は追加されたノードだけをキューに積み、500msのデバウンスで処理する。拡張自身が作ったShadow Hostの中は無視する
- 処理済みのテキストノードは `WeakSet` で記録し、二重に処理しない
- 統計（総語数・異なり語・未知語の出現回数）は差分で積み上げる

### 2.5 フェーズ2（YouTube字幕）への備え
テキストの取得元を `TextSource` インターフェースとして抽象化します。

```ts
interface TextSource {
  id: string;                       // 'page-dom' | 'youtube-captions'(将来)
  start(onSegments: (segs: TextSegment[]) => void): void;
  stop(): void;
}
interface TextSegment { node: Text; text: string; blockText: () => string }
```
今回は `PageDomSource` だけを実装します。字幕用は将来、同じパイプライン（tokenize → classify → highlight → stats）に差し込めるようにします。

## 3. ディレクトリ構成

```
eigo/
├─ wxt.config.ts / package.json / tsconfig.json / vitest.config.ts
├─ LICENSE (MIT) / THIRD_PARTY_LICENSES.md / README.md / README.ja.md
├─ docs/DESIGN.md
├─ scripts/
│  ├─ fetch-data.sh            # 元データのダウンロード（リビジョン固定）→ data-src/（git 管理外）
│  ├─ build-data.ts            # → public/data/dict.json, freq.json（生成物はコミットする）
│  ├─ icon.svg / render-icons.mjs
├─ public/data/  public/icon/  # 同梱データとアイコン
├─ src/
│  ├─ core/                    # 純粋関数のみ（ブラウザAPIなし・単体テストの対象）
│  │  ├─ tokenize.ts           # 単語抽出、URL・コードのマスク、縮約形、大文字の種別
│  │  ├─ lemmatize.ts          # wink-lemmatizer＋候補選択（見出し語・頻度順位で判断）
│  │  ├─ classify.ts           # known / ignored / learning / unknown / skip の判定
│  │  ├─ sentence.ts           # 文境界（Intl.Segmenter＋略語の補正）と長文の切り詰め
│  │  ├─ stats.ts              # 既知語率・難易度区分・バッジ表示
│  │  ├─ cloze.ts / dict.ts    # 穴埋め、EJDictの表記の解析
│  │  ├─ srs.ts                # ts-fsrsのラッパー、連続正解数、今日のキュー
│  │  └─ backup.ts             # エクスポート形式・検証・マージ、単語リストの解析
│  ├─ db/schema.ts, queries.ts # Dexieのスキーマ、今日のキュー
│  ├─ messaging/protocol.ts    # 型付きメッセージ（BgApi / ContentMessage）
│  ├─ settings.ts              # storage.local の設定
│  ├─ sources/                 # TextSource（page-dom.ts。将来は字幕用を追加）
│  ├─ content/                 # analyzer.ts（ハイライト・統計）, popover.tsx（Shadow DOM）
│  ├─ background/              # engine.ts（辞書・判定・語リスト）, cards.ts, data.ts
│  ├─ ui/                      # 共通CSS、Meaningコンポーネント
│  └─ entrypoints/             # background.ts, content/, popup/, study/, options/
└─ tests/                      # 単体テスト（*.test.ts）と E2E（e2e/*.mjs, Playwright）
```

## 4. データモデル

### IndexedDB（Dexie, DB名 `eigo`）
```ts
// 既知語・無視語。ここに無い見出し語は「未知」
words:   { lemma: string /*PK*/, status: 'known'|'ignored',
           source: 'seed'|'manual'|'promoted'|'import', updatedAt: number }

cards:   { id: string /*PK uuid*/, lemma: string, surface: string,
           sentence: string, url: string, title: string, meaning: string,
           createdAt: number, updatedAt: number,
           fsrs: FsrsCard,          // due, stability, difficulty, reps, lapses, state, last_review …
           streak: number,          // Good/Easyが続いた回数（Againで0に戻る）
           promoted: boolean }
  indexes: lemma, fsrs.due, fsrs.state, createdAt

reviews: { id: ++auto, cardId: string, rating: 1|2|3|4, reviewedAt: number,
           state: number, elapsedDays: number, scheduledDays: number }
  indexes: cardId, reviewedAt      // 1日の上限の集計と、将来のFSRSパラメータ最適化に使う

meta:    { key: string /*PK*/, value: unknown }               // 将来のマイグレーション用
// 辞書は IndexedDB に入れず、background が public/data/dict.json をメモリに読み込む
```
- 同じ見出し語のカードを複数作れる（例文が違う場合）。カード一覧ではまとめて表示する
- カードを保存した語は、まだ既知語ではないので下線は残る。学習中は青い点線で表示する（設定でオフにできる）

### 設定（storage.local）
```ts
{ seedSize: number /* 0|1000|3000|5000|8000|10000 */, dailyNewLimit: 20, dailyReviewLimit: 200,
  promoteAfter: 5, desiredRetention: 0.9, dayStartHour: 4, clozeHint: true, showLearning: true,
  disabledSites: string[] /* hostname（www. は除く） */, onboarded: boolean }
```

### エクスポート形式（JSON）
```json
{ "format": "eigo-backup", "version": 1, "exportedAt": "...",
  "words": [...], "cards": [...], "reviews": [...], "settings": {...} }
```
インポート時は「マージ（新しい方の updatedAt を採用）」か「置き換え」を選べるようにします。

## 5. 判定ロジック（core）

1. **マスク**：URL、メールアドレス、`@handle`、`#tag`、コード風の文字列（`foo_bar`、`camelCase`）を対象から外す
2. **トークン化**：`/[A-Za-z]+(?:['’][A-Za-z]+)*/g`。ハイフン語は部分ごとに判定する（`well-known` → `well` と `known`）。`'s` / `n't` / `'re` / `'ll` などは語幹だけを残す
3. **除外**：
   - 数字を含むもの、1文字の語（`a` と `I` は既知扱い）
   - 全部大文字（2文字以上）の頭字語
   - 文中で大文字始まりの語は固有名詞とみなす。文頭の大文字語は、小文字形が辞書か頻出語にあれば通常の語として扱う
4. **見出し語化**：小文字化 → wink-lemmatizerで名詞・動詞・形容詞の候補を出す → 既知語・辞書にある候補を優先、無ければ原形に最も近いもの
5. **判定**：`ignored` → 計算から除外、`known` → 既知、カードあり → `learning`（未知として数える）、それ以外 → 未知（下線）。`-ly` の副詞は元の形容詞が既知なら既知とみなす
6. **統計**：既知語率 = 既知 /（既知 + 未知）。区分は ≥98 快適（緑）、95〜98 辞書少し（黄）、<95 難しい（赤）

## 6. 頻出語リストの選定

| 候補 | ライセンス | 判断 |
|---|---|---|
| google-10000-english | LDCライセンス由来、「商用利用は推奨しない」 | ✗ MITと両立しない |
| hermitdave/FrequencyWords | コードはMIT、**データはCC BY-SA 4.0** | ✗ 条件に合わない |
| wordfreq | データは CC BY-SA 4.0 | ✗ |
| NGSL | CC BY-SA 4.0 | ✗ |
| **IlyaSemenov/wikipedia-word-frequency**（enwiki 2023） | リポジトリはMIT | △ 採用案 |

**採用案**：IlyaSemenov/wikipedia-word-frequency の英語版の結果を使います。ビルド時に、見出し語化 → 同じ見出し語の頻度を合算 → EJDictにある語だけを残す → 頻度順に並べる、という処理をします。

- 懸念点：Wikipediaは百科事典なので、`born`・`county`・`species` のような語が日常会話よりも上位に来やすくなります。ただし初期の既知語リストとしては実用上問題ないと考えます
- 補足：単語の出現回数は事実データなので、元のテキストのライセンス（CC BY-SA）は及ばないと考えています。出典は `THIRD_PARTY_LICENSES.md` に明記します
- 自分のリスト（NGSLなど）を使いたい場合は、機能5の「テキストで一括インポート」で対応できます（同梱はしません）

## 7. 画面

- **ポップアップ**：既知語率（色つき）、総語数、異なり語数、未知語の上位20語（クリックで「知ってる」「無視」）、「このサイトで有効」のトグル、今日の復習枚数、学習ページを開くボタン
- **ポップオーバー**（Shadow DOM）：見出し語、元の語形、辞書の意味、［知ってる］［保存］［無視］。Escか外側のクリックで閉じる
- **学習ページ**：表面は穴埋めの例文（＋ヒントとして先頭の1文字を表示できる）、Space で裏返す、1〜4キーで評価。タブでカード一覧（検索、編集、削除）
- **オプション**：初回ウィザード（N語の選択）、上限の設定、昇格の回数、エクスポート／インポート、一括インポート、無効にしたサイトの一覧

## 8. 実装の順番
① core＋テスト → ② content（ハイライト）＋バッジ＋ポップアップ → ③ ポップオーバー＋保存 → ④ 学習ページ → ⑤ オプション・バックアップ・README
