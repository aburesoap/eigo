# eigo — a local-only English vocabulary browser extension

English | [日本語](README.ja.md)

eigo analyzes English text on web pages, **underlines words you don't know yet**, shows the page's **known-word coverage**, lets you **save words together with their sentence**, and **reviews them with FSRS**. It is a Chrome extension (Manifest V3) that also builds for Firefox.

- No servers, no paid APIs, no accounts. Everything runs inside your browser.
- No analytics or telemetry. Data is stored only in this browser (IndexedDB and `storage.local`).
- MIT licensed. All bundled data and libraries use MIT-compatible licenses.

> The UI is in Japanese (it uses an English–Japanese dictionary).

## Features

| Feature | Details |
|---|---|
| Underlines | Words are lemmatized (running → run); words not in your known list get a red underline. Proper nouns, acronyms, numbers, URLs, e-mail addresses, code and editable fields are skipped. Content added later is handled too. |
| Coverage meter | The toolbar badge shows the known-word percentage: ≥98% green ("comfortable"), 95–98% yellow ("some dictionary use"), <95% red ("hard"). The popup shows total tokens, distinct words and the most frequent unknown words. |
| Per-site switch | "このサイトで有効" (enabled on this site) in the popup. |
| Word popover | Click an underlined word (**Alt+click** inside links) to see its meaning and sentence, then choose Known / Save / Ignore (keys **K / S / I**). |
| Cards | Saves the lemma, the word form, the sentence that contains it, the URL, the page title, the time and the dictionary meaning. Saved words get a blue dotted underline. |
| Review (SRS) | The front shows the sentence with the word blanked out; the back shows the meaning, the full sentence and a source link. Rate with Again / Hard / Good / Easy (keys **1–4**); FSRS schedules the next review. Daily limits for new cards and reviews. |
| Auto-promotion | After N consecutive Good/Easy answers (default 5; Again resets the count), the word moves to the known list. |
| Card list | Search, sort, edit and delete. |
| First-run setup | Registers the top N frequent words (1,000–10,000) as known. |
| Backup | JSON export/import (merge or replace) and plain-text bulk import of known words (one word per line). |

## Install (build from source)

Requires Node.js 20+.

```bash
git clone <this repository>
cd eigo
npm ci
npm run build            # Chrome  → .output/chrome-mv3/
npm run build:firefox    # Firefox → .output/firefox-mv3/
```

### Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3`.
4. A setup tab opens: choose how many frequent words you already know (5,000 is recommended) and click "この設定で始める" (start).
5. Pin eigo from the puzzle-piece menu so you can see the badge.

To update: run `npm run build` again, click the reload button (↻) for eigo on `chrome://extensions`, then reload any open pages.

### Firefox (140+)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `.output/firefox-mv3/manifest.json`.
3. Firefox does not grant MV3 host permissions by default: in `about:addons` → eigo → Permissions, allow access to all websites.

## How to check that it works

1. Open an English page (e.g. an English Wikipedia article): unknown words are underlined in red and the badge shows the coverage (e.g. `96`).
2. Click the toolbar icon: coverage, token counts and the top unknown words appear. "知ってる" (I know it) on a row removes that word's underline at once.
3. Click an underlined word: its meaning appears.
   - Save (S): the underline turns into a blue dotted line.
   - Known (K): every underline of that word on the page disappears.
   - Ignore (I): the underline disappears and the word no longer counts towards coverage.
4. Click "復習する" (review) in the popup to open the study page: Space shows the answer, 1–4 rates it.
5. Search, edit and delete cards on "カード一覧" (card list).
6. On the settings page, export a JSON backup and import it again.

## Development

```bash
npm run dev          # opens a development browser with live reload
npm test             # unit tests (Vitest); the logic lives in pure functions in src/core/
npm run compile      # type check
npm run e2e          # builds, then runs end-to-end tests in a real Chromium with Playwright
```

- Architecture and data model: [docs/DESIGN.md](docs/DESIGN.md) (Japanese)
- Regenerate the bundled data: `npm run fetch:data && npm run build:data` (downloads to `data-src/`, writes `public/data/*.json`)

## Privacy

- The extension makes no network requests; bundled data is loaded from the extension package.
- Page text is only passed between the tab and the extension's background script for analysis. Only what you save as a card (one sentence, the URL and the title) is stored.
- Uninstalling the extension deletes all data, so export a backup first.

## Data and library licenses

See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for details and full texts (the file is also shipped inside the extension).

| Name | License | Used for |
|---|---|---|
| [EJDict-hand](https://github.com/kujirahand/EJDict) | CC0 1.0 (public domain) | English–Japanese dictionary |
| [wikipedia-word-frequency](https://github.com/IlyaSemenov/wikipedia-word-frequency) (enwiki 2023-04-13) | MIT | Frequency list |
| [wink-lemmatizer](https://github.com/winkjs/wink-lemmatizer) / wink-lexicon | MIT (WordNet 3.0-derived data under the WordNet License) | Lemmatization |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | FSRS |
| [Dexie.js](https://github.com/dexie/Dexie.js) | Apache-2.0 | IndexedDB |
| [Preact](https://github.com/preactjs/preact) | MIT | UI |

The frequency list comes from English Wikipedia, so encyclopedic words (`county`, `species`, …) rank higher than in everyday English. To use your own list, import it on the settings page (bulk known-word import).

## License

[MIT](LICENSE)
