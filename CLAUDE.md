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
| `js/storage.js` | `localStorage` for UI prefs (categories, tags, chart target, current page, default tag, default rate, demo mode flag, theme) |
| `js/transactions.js` | Central orchestrator — CRUD, filtering, grouping, period logic |
| `js/ui.js` | DOM rendering, form management, tag chips, autocomplete display |
| `js/modal.js` | Modal open/close with injected content |
| `js/navigation.js` | Page switching (shows/hides sections, manages nav state) |
| `js/chart.js` | Chart.js wrapper — pie/bar charts, custom HTML legend, 20-color palette |
| `js/import-export.js` | JSON bulk import/export via File API. **Export format:** `{ "transactions": [...], "settings": { "defaultTag": "", "defaultRate": "ok", "theme": "system" } }` — settings are always included in the export. **Import** accepts two formats: legacy bare array `[...]` (transactions only, no settings applied) and new wrapper object `{ "transactions": [...] }` (with optional `settings`). The optional `settings` object (if present and is a plain object) is applied after `clearAllTransactions` and before `bulkAddTransactions`: `defaultTag` (string), `defaultRate` (one of `"waste"`, `"ok"`, `"good"`; `""` and unknown values are silently skipped), `theme` (one of `"system"`, `"light"`, `"dark"`) — each field is independently optional; invalid types/values are silently skipped. All three fields update both `localStorage` (via `Storage`) **and** the corresponding DOM elements immediately without page reload: `theme` → `data-theme` on `<html>` + `#theme-select`; `defaultRate` → `#default-rate-select`; `defaultTag` → `#default-tag-input` + the dynamic `option[value="default-tag"]` in `#transactions-limit` (added/replaced/removed; if the option was active and tag is cleared, the select resets to `all`). **Validation:** `validateTransaction(tx)` returns `null` for valid transactions or a Russian human-readable reason string for invalid ones. The import loops through all transactions and aborts on the first failure with the message `Ошибка: некорректная транзакция в позиции <N> — <reason>` (1-based index). Field check order is fixed: `description` → `amount` → `category` → `rate` → `tags` (incl. per-element check `tags[i]` with index in the message) → `date`. Each field is checked first for presence (`'field' in tx`) and then for type (`string` / finite `number` / `Array<string>` / one of `"waste" \| "ok" \| "good"`). Type names in messages come from `describeType(value)` which returns `null`, `array`, or `typeof value`. The `transactions` array itself can be empty — that's a valid no-op import. The success message `"Успешно импортировано!"` is set **only inside the `bulkAddTransactions` success callback**, never synchronously after `readAsText`. All error messages set CSS class `.error` on `#import-status`; success clears it. The selected file is reset (`#file-name-display`/`#file-upload-zone.has-file`/`#input-json.value`) only on success, so on error the user still sees which file failed. |
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

1. **Auto-prepended to new transactions** — added to `ui.tags` via `UI.initDefaultTag(tag)` on three occasions:
   - Once at app load (in `initApp`).
   - After a successful form submit — inside the `db.addTransaction` callback, after `clearTags`/`renderTags`.
   - On the form reset button (`#form-reset-btn`) click.
   `initDefaultTag` is idempotent: it skips if the tag is already in `ui.tags` or if the tag is an empty string. The user can remove it for an individual transaction by clicking ×; navigating between pages does NOT re-add it (navigation never touches the form).

2. **Period filter** — when a default tag is set, `setupLimitSelect` (in `transactions.js`) dynamically injects an `<option value="default-tag">` into `#transactions-limit` with the tag name as label, inserted before the `custom` option. Selecting it triggers `singleLoadTransactionsRender` to read all transactions and filter to only those whose `tags` array includes the current default tag. If the default tag is later cleared while this option is selected, `singleLoadTransactionsRender` resets `this.limit` to `"all"` and falls through to the normal period logic.

**Live update of `#transactions-limit`** — the `#default-tag-save-btn` click handler in `app.js` also updates the `#transactions-limit` select immediately without page reload: saves the current `limitSelect.value === 'default-tag'` state **before** removing the old option (removing a selected option changes `.value`, so the check must happen first), then adds/removes the option. If the tag was cleared while `default-tag` was the active selection, the select resets to `all` and `singleLoadTransactionsRender` is called.

**Default rate** — a single rate stored in `localStorage.defaultRate` via `Storage.getDefaultRate/setDefaultRate`. `getDefaultRate()` returns `"ok"` when nothing is stored. It is applied in two places:

1. **Pre-selected at app load** — `applyDefaultRate()` in `app.js` sets `#rate-select` value once in `initApp` (regardless of the current page). Navigation does NOT re-apply it — a rate the user picked survives page switches.
2. **Restored after form submit** — in the `db.addTransaction` callback (after `e.target.reset()`), `#rate-select` is set back to the default rate.
3. **Restored by the form reset button** (`#form-reset-btn`).

Configured via `#default-rate-select` in `#settings-section` — a `<select>` that auto-saves on `change` (no save button, like the theme selector). Options: `waste`, `ok` (default, selected in HTML), `good`.

**Transaction date/time inputs** — `#date-input` (`type="date"`) and `#time-input` (`type="time"`) on the input page, placed after the tags block and before the submit button (`.datetime-inputs` → two `.datetime-field` blocks with labels «Дата»/«Время»). `#date-input` sits in `.date-input-row` between `#date-minus`/`#date-plus` buttons (`.date-step-btn`) that shift the date by ±1 day — wired in `setupTransactionForm` via `shiftDateInputValue` from `utils.js` (empty value is treated as today, so one −1 click on a fresh form gives yesterday). There are intentionally **no ±1 buttons for time** (day-level backfill is the use case; an hour stepper has confusing midnight-wraparound semantics). Instead, `#time-input` sits in `.time-input-row` with a `#time-reset-btn` («Сейчас», reuses `.date-step-btn` styling) to its right — clicking it sets ONLY `#time-input` to the current time (`toTimeInputValue(new Date())`), leaving `#date-input` and all other form fields untouched; the handler lives in `app.js` next to the `#form-reset-btn` handler.

- **Pre-fill** — both fields are filled with the current moment by `applyCurrentDateTime()` in `app.js` once at app load, re-filled in the `db.addTransaction` callback after `e.target.reset()` clears them, and refreshed by the form reset button. **Navigation between pages must NOT touch these (or any other) form values** — a half-filled form survives page switches by design; the user refreshes a stale date/time explicitly via «Сбросить».
- **Submit** — `date: getTransactionTimestamp(dateValue, timeValue)` (in `utils.js`). Both empty → `now` (fallback safety net); date only → that day with the **current time-of-day** (preserves intra-day ordering when backfilling several transactions); time only → today at that time. Date strings are parsed by components, never via `new Date("YYYY-MM-DD")` (which parses as UTC midnight and can shift the day).
- **Helpers in `utils.js`** — `toDateInputValue(date)` → `"YYYY-MM-DD"`, `toTimeInputValue(date)` → `"HH:MM"` (both local, zero-padded), `shiftDateInputValue(value, days, today)`, `getTransactionTimestamp(dateValue, timeValue, now)` — all pure, take optional `now`/`today` for testability.
- **Dark theme** — `input[type="date"]/[type="time"]` get `color-scheme: var(--input-color-scheme)` (`light` in `:root`, `dark` in both dark-theme blocks), otherwise the native calendar/clock picker icons are dark-on-dark.

**Transaction form reset button (`#form-reset-btn`, «Сбросить»)** — sits next to the submit button inside `.form-actions` (flex row: submit takes `flex: 1`, reset is `.btn-secondary`). The click handler in `app.js` returns the form to its initial state — the same state as after a successful submit: `form.reset()`, hides both autocomplete suggestion divs, `ui.clearTags()` + `ui.renderTags()` + `ui.initDefaultTag(...)`, re-applies the default rate and the current date/time. This is the ONLY way (besides submit) the form gets back to defaults — navigation never resets it.

**Period filter select (`#transactions-limit`)** — values: `all` (default), `day`, `week`, `month`, `year`, `default-tag` (dynamic, only present when a default tag is set), `custom`. The `custom` value reveals `#custom-period-inputs` with start/end date inputs. All other non-`custom` values trigger an immediate `singleLoadTransactionsRender`. The selected value is persisted in `localStorage.limit` via `Storage.getLimit/setLimit`.

**Rename tag** — `#rename-tag-section` on the settings page. Two inputs: current tag (with autocomplete from `allTags`) and replacement (no trim, so leading spaces are valid tag names). After typing a valid current tag the UI fetches and shows transaction count + total amount via `TransactionManager.getTagStats()`. A warning appears if the replacement tag already exists (tags will be merged). The rename is performed by `TransactionManager.renameTag(oldTag, newTag, cb)` which updates every matching transaction in IndexedDB one by one, then updates `allTags` in memory and `localStorage`, and calls `singleLoadTransactionsRender`. The UI logic is isolated in `js/rename-tag.js` and called from `app.js` via `setupRenameTagUI(transactionManager, allTags)`.

Settings UI lives on the **"Настройки"** page (`#export-page`) alongside export/import controls.

**Dark theme** — three-way selector (`#theme-select` in `#settings-section`): `system` (default), `light`, `dark`. The choice is persisted via `Storage.getTheme/setTheme` (`localStorage.theme`). Switching sets `data-theme="dark"` / `data-theme="light"` on `<html>`, or removes the attribute for `system`. An inline `<script>` in `<head>` (before the stylesheet) reads `localStorage.theme` and pre-applies the attribute to avoid flash of wrong theme on load. The CSS uses `:root` custom properties for all colors; they are overridden in `html[data-theme="dark"]` and in `@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) }` — the latter handles the "system" option when the OS is in dark mode.

**Transaction list rendering** (`loadTransactions` in `transactions.js`) — each `<li class="transaction-li">` uses a CSS custom property `--rate-color` set inline to the rate's hex color from `RATES`. This drives a colored left border via `border-left: 4px solid var(--rate-color)`. The right column uses class `.transaction-li-right` (`flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end`) to prevent the amount/rate label from wrapping or shifting when descriptions are long. Date group separators are `<li class="date-separator">` inserted between days. Tags are rendered as `<span class="list-tag">` chips. When the list is empty an `<li class="empty-state">` placeholder is shown — and when `Storage.getDemoMode()` is false, the empty state also includes a `#empty-state-demo-btn` whose click handler calls `window.loadDemo()` (set up by `setupDemoUI` in `js/demo.js`).

**Demo mode** — entry: empty-state button (`#empty-state-demo-btn`, only when DB is empty and demo flag is off). Loading: `Demo.loadDemoData()` fetches `./demo-data.json` (file is in the same `{ "transactions": [...] }` envelope as exports — `loadDemoData` also accepts the legacy bare-array format for backward compatibility), calls `clearAllTransactions`, clears the cached `categories`/`tags` keys in `localStorage`, then `bulkAddTransactions` with `id` stripped from each record (the IDB store has `autoIncrement: true` and assigns fresh ids), sets `localStorage.demoMode = "true"`, and re-runs `singleLoadTransactionsRender` + `loadAllCategories` + `loadAllTags` so the in-memory Maps in `TransactionManager` are rebuilt. Active state: `#demo-banner` (top of `#home-page`) is visible whenever `Storage.getDemoMode()` is truthy. The "Очистить" button shows a `confirm()` dialog and on accept calls `Demo.clearDemoData()` — same teardown as load minus the fetch/bulkAdd, with the flag cleared. The flag persists until the user explicitly clears; adding a real transaction while in demo mode does NOT auto-clear it (banner stays).

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

**Dev iteration on shell files** — when editing any file in `APP_SHELL` and reloading, you will see the OLD cached version because the fetch handler is cache-first. Either bump `VERSION` for every change (annoying), or in DevTools → Application → Service Workers enable **«Update on reload»** for the duration of the session, or click **Unregister** to drop the SW entirely. Plain Cmd+Shift+R does NOT bypass the SW cache.

## Landing page

**Standalone `landing.html`** — separate static page for first-time visitors. Self-contained: all CSS inline in `<style>`, no module imports. Hero, features list, 3 inline-SVG screenshot placeholders (marked `<!-- TODO -->` for replacement with real screenshots), and two CTAs:
- **«Попробовать демо»** → `index.html?demo=1`. Shows `confirm()` warning only if real data exists: parses `localStorage.tags` / `localStorage.categories` and accepts only objects with at least one key (an empty `{}` written by `Storage.saveTags(new Map())` does NOT count); also opens `FinanceTrackerDB` (no version → never triggers upgrade, returns 0 if the `transactions` store is missing) and counts the `transactions` store. UI prefs alone (chartTarget, currentPage, etc.) do NOT trigger the warning.
- **«Начать с нуля»** → `index.html`.

Both CTAs set `localStorage.hasVisited = '1'` before navigating. Self-contained: no module imports, all CSS inline in `<style>`. Linked to `manifest.json` so installing the PWA from landing produces the same installable app as from index.

**First-visit redirect** — inline `<script>` in `index.html` `<head>` (placed before the stylesheet to prevent flash) redirects to `landing.html` when ALL of these hold:
- `localStorage.hasVisited` is missing
- `localStorage.length === 0` — proxy for "no app data ever stored", protects existing users from being sent to landing on deploy
- `location.search` is empty — intentional entry like `?demo=1` skips the redirect

The flag is read/written via raw `localStorage` (NOT through the `Storage` module) because this script runs before any imports. For the same reason, `landing.html` sets the flag directly. `app.js` also sets `hasVisited='1'` unconditionally at the end of `initApp` so any user who reaches the app once is permanently marked.

**`?demo=1` entry point** — handled in `app.js` after `setupDemoUI(demo)`: if `URLSearchParams.get('demo') === '1'`, calls `window.loadDemo()` (which loads + updates banner) and strips the query via `history.replaceState` so a refresh doesn't re-trigger. Uses `window.loadDemo` (not `demo.loadDemoData()` directly) because the global wrapper from `setupDemoUI` also updates the banner visibility.

**Dark theme on landing** — the landing page shares the same `localStorage.theme` key (`dark` / `light` / anything else = system) as the main app, so theme preference syncs automatically between pages. Implementation details:
- An inline `<script>` in `<head>` (before `<style>`) reads `localStorage.theme` and pre-applies `data-theme` on `<html>` to prevent flash.
- All colors in `<style>` use CSS custom properties (`--lnd-*`), overridden in `html[data-theme="dark"]` and `@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) }`.
- A `position: fixed` toggle button (`#theme-toggle`, top-right corner) shows a sun icon when dark (click → light) and a moon icon when light (click → dark). The IIFE at the end of `<body>` wires it up via `applyTheme()` / `getEffective()` helpers.
- `getEffective()` returns the stored theme if `'dark'`/`'light'`; otherwise falls back to `window.matchMedia('(prefers-color-scheme: dark)')`.

`landing.html` is in `APP_SHELL` (`sw.js`) — bump `VERSION` when editing it.

## CSS / UI conventions

**Form validation** — uses `:user-invalid` (not `:invalid`) so red borders only appear after the user has interacted with a field. `:invalid` fires immediately on page load for empty `required` fields, which looks broken.

**Secondary buttons (`.btn-secondary`)** — neutral style for non-primary actions (currently the form reset button): `var(--bg-app)` background, `var(--text-secondary)` text, `1px solid var(--border-input)` border, no shadow; hover switches to `var(--bg-hover)` + `var(--text-primary)`. Built on theme variables so it works in dark mode. Use it instead of inventing per-button styles when an action must not compete with the primary indigo button.

**Tag input row** — `#tag-input` and `#add-tag` live inside `.tags-input-row` (a flex container with `align-items: stretch`). This keeps the button the same height as the input. Do not add a separate `#tag-input` CSS block with its own `padding`/`border-radius` — global `input` styles already cover it and overrides will make the field look inconsistent with the rest of the form.

**Custom file upload zone** (`#import-section`) — the native `<input type="file" id="input-json">` is hidden via `display: none`. The visible UI is a `<label for="input-json" class="file-upload-zone">`. Clicking the label triggers the browser's file picker. A `change` listener on `#input-json` (in `import-export.js`) sets `#file-name-display` text and toggles `.has-file` on `#file-upload-zone` to show a highlighted state. Reset happens **only on successful import** (inside the `bulkAddTransactions` callback) — on validation/parse errors the file name stays visible so the user can identify which file failed.

**Import status (`#import-status`)** — single line under the upload zone. Successful import writes `Успешно импортировано!` and removes class `.error`; any failure writes a localized Russian message and adds class `.error` (red text via `#import-status.error { color: #c0392b }`). The element has `word-wrap: break-word; overflow-wrap: anywhere` because validation messages can be long (e.g. include the full bad `rate` JSON value).

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
| `tests/import-export.test.js` | `js/import-export.js` — FileReader mocked, `localStorage` stubbed via `vi.stubGlobal` (the import flow calls `Storage.clearTags`/`clearCategories`, which use `delete localStorage.tags` — jsdom's native Proxy throws "Cannot convert undefined or null to object" on this in some environments). `Blob` is replaced with a `vi.fn` wrapper in the export-format test to capture the serialized payload. Validation coverage lives in two nested `describe` blocks: **«валидация импорта (полное покрытие)»** uses table-driven `it.each` on `JSON.parse` failures, root-document shape errors (incl. bare arrays), and per-field bad/good values; **«текст причины ошибки»** asserts the exact Russian string returned by `validateTransaction` for every branch (missing field, wrong type per field, bad `rate`, bad `tags[i]` with index). **«импорт settings»** covers all settings fields (optional, selective application, invalid values silently skipped, Storage + DOM elements updated immediately — theme select, rate select, tag input, transactions-limit option). Helper `importPayload(payload)` does `setFile()` + sets `fileReaderContent` + `ie.importData()` + `await flush()`; when passed an array it automatically wraps it as `{ transactions: [...] }` — use it for any new import test instead of duplicating the dance. |
| `tests/rename-tag.test.js` | `js/rename-tag.js` — DOM with jsdom, TransactionManager mocked |
| `tests/demo.test.js` | `js/demo.js` — `fetch` stubbed via `global.fetch = vi.fn(...)`, Storage mocked, `confirm` spied via `vi.spyOn(window, 'confirm')` |
| `tests/landing-theme.test.js` | inline theme logic from `landing.html` — `localStorage` stubbed via `vi.stubGlobal`, `matchMedia` stubbed via `vi.stubGlobal`. Tests cover: pre-application script (sets/skips `data-theme` based on stored value), `getEffective()` (localStorage priority then matchMedia fallback), `applyTheme()` (sets attribute + saves to localStorage), `updateBtn()` (correct icon and `aria-label` per effective theme), toggle click (dark↔light). Logic is replicated inline in the test file since `landing.html` has no importable module. |
| `tests/app.test.js` | `app.js` entry point — all module imports mocked via `vi.mock`, minimal DOM set up in `beforeAll`, `app.js` imported dynamically once (triggers `initApp()`), then `await new Promise(resolve => setTimeout(resolve, 0))` flushes the async init. Tests cover `#default-tag-save-btn` behavior: adds/replaces/removes `option[value="default-tag"]` in `#transactions-limit` and resets the select + calls `singleLoadTransactionsRender` when the active `default-tag` selection is cleared. Also covers `applyCurrentDateTime`: app init fills `#date-input`/`#time-input` with the current moment, nav click does NOT change form values (`js/utils.js` is NOT mocked here — app.js imports its date helpers for real), and the `#form-reset-btn` handler: clears fields, hides autocomplete suggestions, re-applies default tag/rate and current date/time. Also covers `#time-reset-btn`: sets `#time-input` to the current `HH:MM` (asserted with a one-minute tolerance) while `#date-input` and all other form fields stay untouched. Also covers init defaults: `initDefaultTag` + default rate are applied once at app load (a dedicated describe re-imports `app.js` with `Storage.getDefaultTag/getDefaultRate` pre-mocked and restores them in `afterAll` so the leak doesn't affect later describes). |

**Key mocking patterns:**
- `localStorage` — `vi.stubGlobal('localStorage', createLocalStorageMock())` (jsdom Proxy rejects direct property writes)
- `Chart` global — `global.Chart = vi.fn(...)` (CDN-loaded, not importable)
- `FileReader` — replaced with synchronous `MockFileReader` that fires via `queueMicrotask`; set `fileReaderShouldError = true` before the call to simulate `onerror`
- `fake-indexeddb` — `global.indexedDB = new IDBFactory()` per test for isolation
- `fetch` — `global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }))` (used in `demo.test.js`)

**Rules for tasks**
- If you don't understand any part of task you always must ask questions and don't generate anything
- When i tell you that task is fulfilled you should append usefull information to CLAUDE.md