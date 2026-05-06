# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This is the **original vanilla JS PWA** version of the finance tracker

## Running Locally

No build step — serve static files directly:

```sh
python -m http.server 8080
```

Deployment to GitHub Pages is automated via `.github/workflows/deploy.yml` on push to `master`.

## Architecture

**Entry point:** `app.js` — instantiates all modules, wires dependencies, exposes global handlers for DOM events.

**Module map:**

| File | Responsibility |
|------|---------------|
| `js/db.js` | IndexedDB abstraction (store: `transactions`, index: `date_idx`) |
| `js/storage.js` | `localStorage` for UI prefs (categories, tags, chart target, current page, default tag, demo mode flag) |
| `js/transactions.js` | Central orchestrator — CRUD, filtering, grouping, period logic |
| `js/ui.js` | DOM rendering, form management, tag chips, autocomplete display |
| `js/modal.js` | Modal open/close with injected content |
| `js/navigation.js` | Page switching (shows/hides sections, manages nav state) |
| `js/chart.js` | Chart.js wrapper — pie/bar charts, custom HTML legend, 20-color palette |
| `js/import-export.js` | JSON bulk import/export via File API |
| `js/autocomplete.js` | Weighted prefix-match suggestions (`suggestAutocomplete()`); `setupAutocomplete` is exported but not used anywhere — UI modules implement autocomplete inline |
| `js/utils.js` | Date formatting, date-range calculation, map helpers, groupBy |
| `js/rename-tag.js` | Tag rename UI — `setupRenameTagUI(transactionManager, allTags)` wires the settings form |
| `js/demo.js` | Demo mode — `Demo.loadDemoData()` fetches `demo-data.json`, clears DB + tag/category caches, bulk-adds (stripping `id` so autoIncrement assigns fresh ones), sets `demoMode` flag, reloads. `Demo.clearDemoData()` is the inverse. `setupDemoUI(demo)` wires `#demo-banner` + `#demo-clear-btn` and exposes `window.loadDemo` for the empty-state button. |

**Data model — transaction object:**
```js
{ id, description, amount, category, rate, tags: [], date /* ms timestamp */ }
```

`rate` values: `"waste"` (плохая), `"ok"` (ок), `"good"` (осознанная).

**Default tag** — a single tag stored in `localStorage.defaultTag` via `Storage.getDefaultTag/setDefaultTag`. It is used in two ways:

1. **Auto-prepended to new transactions** — added to `ui.tags` via `UI.initDefaultTag(tag)` on two occasions:
   - When the user navigates to the input page (click listener on the nav item in `app.js`).
   - After a successful form submit — inside the `db.addTransaction` callback, after `clearTags`/`renderTags`.
   `initDefaultTag` is idempotent: it skips if the tag is already in `ui.tags` or if the tag is an empty string. The user can remove it for an individual transaction by clicking ×; it is restored on the next page visit.

2. **Period filter** — when a default tag is set, `setupLimitSelect` (in `transactions.js`) dynamically injects an `<option value="default-tag">` into `#transactions-limit` with the tag name as label, inserted before the `custom` option. Selecting it triggers `singleLoadTransactionsRender` to read all transactions and filter to only those whose `tags` array includes the current default tag. If the default tag is later cleared while this option is selected, `singleLoadTransactionsRender` resets `this.limit` to `"all"` and falls through to the normal period logic.

**Period filter select (`#transactions-limit`)** — values: `all` (default), `day`, `week`, `month`, `year`, `default-tag` (dynamic, only present when a default tag is set), `custom`. The `custom` value reveals `#custom-period-inputs` with start/end date inputs. All other non-`custom` values trigger an immediate `singleLoadTransactionsRender`. The selected value is persisted in `localStorage.limit` via `Storage.getLimit/setLimit`.

**Rename tag** — `#rename-tag-section` on the settings page. Two inputs: current tag (with autocomplete from `allTags`) and replacement (no trim, so leading spaces are valid tag names). After typing a valid current tag the UI fetches and shows transaction count + total amount via `TransactionManager.getTagStats()`. A warning appears if the replacement tag already exists (tags will be merged). The rename is performed by `TransactionManager.renameTag(oldTag, newTag, cb)` which updates every matching transaction in IndexedDB one by one, then updates `allTags` in memory and `localStorage`, and calls `singleLoadTransactionsRender`. The UI logic is isolated in `js/rename-tag.js` and called from `app.js` via `setupRenameTagUI(transactionManager, allTags)`.

Settings UI lives on the **"Настройки"** page (`#export-page`) alongside export/import controls.

**Transaction list rendering** (`loadTransactions` in `transactions.js`) — each `<li class="transaction-li">` uses a CSS custom property `--rate-color` set inline to the rate's hex color from `RATES`. This drives a colored left border via `border-left: 4px solid var(--rate-color)`. The right column uses class `.transaction-li-right` (`flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end`) to prevent the amount/rate label from wrapping or shifting when descriptions are long. Date group separators are `<li class="date-separator">` inserted between days. Tags are rendered as `<span class="list-tag">` chips. When the list is empty an `<li class="empty-state">` placeholder is shown — and when `Storage.getDemoMode()` is false, the empty state also includes a `#empty-state-demo-btn` whose click handler calls `window.loadDemo()` (set up by `setupDemoUI` in `js/demo.js`).

**Demo mode** — entry: empty-state button (`#empty-state-demo-btn`, only when DB is empty and demo flag is off). Loading: `Demo.loadDemoData()` fetches `./demo-data.json`, calls `clearAllTransactions`, clears the cached `categories`/`tags` keys in `localStorage`, then `bulkAddTransactions` with `id` stripped from each record (the IDB store has `autoIncrement: true` and assigns fresh ids), sets `localStorage.demoMode = "true"`, and re-runs `singleLoadTransactionsRender` + `loadAllCategories` + `loadAllTags` so the in-memory Maps in `TransactionManager` are rebuilt. Active state: `#demo-banner` (top of `#home-page`) is visible whenever `Storage.getDemoMode()` is truthy. The "Очистить" button shows a `confirm()` dialog and on accept calls `Demo.clearDemoData()` — same teardown as load minus the fetch/bulkAdd, with the flag cleared. The flag persists until the user explicitly clears; adding a real transaction while in demo mode does NOT auto-clear it (banner stays).

**Chart legend** — Chart.js built-in legend is disabled (`legend: { display: false }`). Instead, `renderCustomLegend(chart)` in `chart.js` builds a `<div id="chart-legend">` with `.legend-item` elements. Clicking an item toggles `meta.data[i].hidden` on the chart and updates `hiddenCategories`. Legend visibility per chart target:
- `category` (pie) — legend rendered, hidden by default; `#legend-toggle` button toggles it.
- `rate` (pie) — legend rendered and always visible (only 3 items); `#legend-toggle` hidden.
- `tags` (bar) — no legend, `#legend-toggle` hidden.

`setLegendToggleVisible(false)` must be called **after** `renderCustomLegend` when the toggle should stay hidden, because `renderCustomLegend` always calls `setLegendToggleVisible(true)` internally.

**Chart controls** — `#chart-target` (Категория/Трата/Тег) and `#transactions-limit` (period) live side-by-side in `.chart-controls` (flex row) above the chart. Do not wrap them in separate `.flex-container` divs.

**Chart size** — `.chart-container` has `max-width: 260px` to keep the pie chart compact.

**No framework, no bundler** for the app itself. Chart.js is loaded from CDN. `package.json` exists only for dev tooling (tests).

## PWA

**Icons** — `icons/` directory. Master is `icons/icon.svg` (Heroicons `chart-pie` on indigo `#4f46e5` rounded-square background). PNG variants are generated from the SVGs via `rsvg-convert` (Homebrew `librsvg`):

```sh
rsvg-convert -w 192 -h 192 icons/icon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/icon-512.png
rsvg-convert -w 512 -h 512 icons/icon-maskable.svg -o icons/icon-maskable-512.png
rsvg-convert -w 180 -h 180 icons/icon.svg -o icons/apple-touch-icon.png
rsvg-convert -w 32  -h 32  icons/icon.svg -o icons/favicon-32.png
```

`icon-maskable.svg` differs from `icon.svg`: it has full-bleed background (no rounded corners) and the chart-pie sits inside the inner ~60% safe zone, per the maskable-icon spec. Regenerate the PNGs after editing either SVG.

**Service worker** — `sw.js` at the project root, registered in `app.js` after `window.load`. Strategy:

- **Install:** precaches the app shell listed in `APP_SHELL` (HTML, CSS, all `js/*.js`, manifest, icons).
- **Activate:** deletes caches whose name doesn't match the current `CACHE_NAME`, then claims clients.
- **Fetch:** network-first for `cdn.jsdelivr.net` (Chart.js) with cache fallback for offline; cache-first for everything else, with same-origin successful responses written through to the cache.

**Updating the SW** — bump the `VERSION` constant in `sw.js` whenever any file in `APP_SHELL` changes (or when adding/removing files from the list). The new version creates a new cache name; the old cache is cleaned up on activation. Without bumping, returning users will keep serving stale assets from their existing cache.

**Adding new files to the app shell** — new files under `js/` or new icons must be appended to `APP_SHELL` in `sw.js` AND `VERSION` must be bumped, otherwise they will not be available offline and may not be served at all if a cache-first miss falls through to a failed network fetch.

## CSS / UI conventions

**Form validation** — uses `:user-invalid` (not `:invalid`) so red borders only appear after the user has interacted with a field. `:invalid` fires immediately on page load for empty `required` fields, which looks broken.

**Tag input row** — `#tag-input` and `#add-tag` live inside `.tags-input-row` (a flex container with `align-items: stretch`). This keeps the button the same height as the input. Do not add a separate `#tag-input` CSS block with its own `padding`/`border-radius` — global `input` styles already cover it and overrides will make the field look inconsistent with the rest of the form.

**Custom file upload zone** (`#import-section`) — the native `<input type="file" id="input-json">` is hidden via `display: none`. The visible UI is a `<label for="input-json" class="file-upload-zone">`. Clicking the label triggers the browser's file picker. A `change` listener on `#input-json` (in `import-export.js`) sets `#file-name-display` text and toggles `.has-file` on `#file-upload-zone` to show a highlighted state. Reset happens at the end of `importData()`.

## Testing

Vitest + jsdom + fake-indexeddb. One test file per module under `tests/`.

```sh
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

**Test file map:**

| File | Module tested |
|------|--------------|
| `tests/utils.test.js` | `js/utils.js` — pure functions |
| `tests/autocomplete.test.js` | `js/autocomplete.js` — `suggestAutocomplete`, `applySuggestion`, `setupAutocomplete` |
| `tests/storage.test.js` | `js/storage.js` — localStorage (stubbed) |
| `tests/db.test.js` | `js/db.js` — IndexedDB via fake-indexeddb |
| `tests/modal.test.js` | `js/modal.js` — DOM with jsdom |
| `tests/navigation.test.js` | `js/navigation.js` — Storage mocked |
| `tests/chart.test.js` | `js/chart.js` — global Chart mocked |
| `tests/ui.test.js` | `js/ui.js` — DOM with jsdom |
| `tests/transactions.test.js` | `js/transactions.js` — DB/Chart/Storage mocked |
| `tests/import-export.test.js` | `js/import-export.js` — FileReader mocked |
| `tests/rename-tag.test.js` | `js/rename-tag.js` — DOM with jsdom, TransactionManager mocked |
| `tests/demo.test.js` | `js/demo.js` — `fetch` stubbed via `global.fetch = vi.fn(...)`, Storage mocked, `confirm` spied via `vi.spyOn(window, 'confirm')` |

**Key mocking patterns:**
- `localStorage` — `vi.stubGlobal('localStorage', createLocalStorageMock())` (jsdom Proxy rejects direct property writes)
- `Chart` global — `global.Chart = vi.fn(...)` (CDN-loaded, not importable)
- `FileReader` — replaced with synchronous `MockFileReader` that fires via `queueMicrotask`; set `fileReaderShouldError = true` before the call to simulate `onerror`
- `fake-indexeddb` — `global.indexedDB = new IDBFactory()` per test for isolation
- `fetch` — `global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }))` (used in `demo.test.js`)

**Rules for tasks**
- If you don't understand any part of task you always must ask questions and don't generate anything
- When i tell you that task is fulfilled you should append usefull information to CLAUDE.md