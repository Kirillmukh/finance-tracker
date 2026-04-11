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
| `js/storage.js` | `localStorage` for UI prefs (categories, tags, chart target, current page, default tag) |
| `js/transactions.js` | Central orchestrator — CRUD, filtering, grouping, period logic |
| `js/ui.js` | DOM rendering, form management, tag chips, autocomplete display |
| `js/modal.js` | Modal open/close with injected content |
| `js/navigation.js` | Page switching (shows/hides sections, manages nav state) |
| `js/chart.js` | Chart.js wrapper — pie/bar charts with legend-click filtering |
| `js/import-export.js` | JSON bulk import/export via File API |
| `js/autocomplete.js` | Weighted prefix-match suggestions (`suggestAutocomplete()`) |
| `js/utils.js` | Date formatting, date-range calculation, map helpers, groupBy |

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

Settings UI lives on the **"Настройки"** page (`#export-page`) alongside export/import controls.

**No framework, no bundler** for the app itself. Chart.js is loaded from CDN. `package.json` exists only for dev tooling (tests).

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
| `tests/autocomplete.test.js` | `js/autocomplete.js` — `suggestAutocomplete` |
| `tests/storage.test.js` | `js/storage.js` — localStorage (stubbed) |
| `tests/db.test.js` | `js/db.js` — IndexedDB via fake-indexeddb |
| `tests/modal.test.js` | `js/modal.js` — DOM with jsdom |
| `tests/navigation.test.js` | `js/navigation.js` — Storage mocked |
| `tests/chart.test.js` | `js/chart.js` — global Chart mocked |
| `tests/ui.test.js` | `js/ui.js` — DOM with jsdom |
| `tests/transactions.test.js` | `js/transactions.js` — DB/Chart/Storage mocked |
| `tests/import-export.test.js` | `js/import-export.js` — FileReader mocked |

**Key mocking patterns:**
- `localStorage` — `vi.stubGlobal('localStorage', createLocalStorageMock())` (jsdom Proxy rejects direct property writes)
- `Chart` global — `global.Chart = vi.fn(...)` (CDN-loaded, not importable)
- `FileReader` — replaced with synchronous `MockFileReader` that fires via `queueMicrotask`
- `fake-indexeddb` — `global.indexedDB = new IDBFactory()` per test for isolation
