// Import/Export module - handles data import and export
import { formatDate } from './utils.js';
import { Storage } from './storage.js';

const VALID_RATES = ['waste', 'ok', 'good'];

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateTransaction(tx) {
  if (tx === null || typeof tx !== 'object' || Array.isArray(tx)) {
    return `ожидался объект, получен ${describeType(tx)}`;
  }
  if (!('description' in tx)) return 'отсутствует поле "description"';
  if (typeof tx.description !== 'string') {
    return `поле "description" должно быть строкой (получено: ${describeType(tx.description)})`;
  }
  if (!('amount' in tx)) return 'отсутствует поле "amount"';
  if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount)) {
    return `поле "amount" должно быть числом (получено: ${describeType(tx.amount)})`;
  }
  if (!('category' in tx)) return 'отсутствует поле "category"';
  if (typeof tx.category !== 'string') {
    return `поле "category" должно быть строкой (получено: ${describeType(tx.category)})`;
  }
  if (!('rate' in tx)) return 'отсутствует поле "rate"';
  if (!VALID_RATES.includes(tx.rate)) {
    return `поле "rate" должно быть одним из ${VALID_RATES.map((r) => `"${r}"`).join(', ')} (получено: ${JSON.stringify(tx.rate)})`;
  }
  if (!('tags' in tx)) return 'отсутствует поле "tags"';
  if (!Array.isArray(tx.tags)) {
    return `поле "tags" должно быть массивом (получено: ${describeType(tx.tags)})`;
  }
  const badTagIndex = tx.tags.findIndex((t) => typeof t !== 'string');
  if (badTagIndex !== -1) {
    return `элемент "tags[${badTagIndex}]" должен быть строкой (получено: ${describeType(tx.tags[badTagIndex])})`;
  }
  if (!('date' in tx)) return 'отсутствует поле "date"';
  if (typeof tx.date !== 'number' || !Number.isFinite(tx.date)) {
    return `поле "date" должно быть числом (получено: ${describeType(tx.date)})`;
  }
  return null;
}

export class ImportExport {
  constructor(db, transactionManager) {
    this.db = db;
    this.transactionManager = transactionManager;
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById("export-btn").addEventListener("click", () => {
      this.exportData();
    });

    document.getElementById("import-btn").addEventListener("click", () => {
      this.importData();
    });

    document.getElementById("input-json").addEventListener("change", (e) => {
      const file = e.target.files[0];
      const display = document.getElementById("file-name-display");
      const zone = document.getElementById("file-upload-zone");
      if (file) {
        display.textContent = file.name;
        zone.classList.add("has-file");
      } else {
        display.textContent = "";
        zone.classList.remove("has-file");
      }
    });
  }

  exportData() {
    this.db.readOnlyTransaction([
      (transactions) => {
        const settings = {
          defaultTag: Storage.getDefaultTag(),
          defaultRate: Storage.getDefaultRate(),
          theme: Storage.getTheme(),
        };
        const json = JSON.stringify({ transactions, settings });
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${formatDate(new Date())}.json`;
        a.click();
      },
    ]);
    document.getElementById("export-status").textContent = "Успешно экспортировано!";
  }

  importData() {
    const jsonInput = document.getElementById("input-json");
    const file = jsonInput.files[0];
    const status = document.getElementById("import-status");

    const setError = (text) => {
      status.textContent = text;
      status.classList.add("error");
    };
    const setSuccess = (text) => {
      status.textContent = text;
      status.classList.remove("error");
    };

    if (!file) {
      setError("Файл не выбран!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      let jsonData;
      try {
        jsonData = JSON.parse(e.target.result);
      } catch (error) {
        console.error(error);
        setError("Ошибка: файл не является валидным JSON");
        return;
      }

      let transactions, settings;
      if (Array.isArray(jsonData)) {
        transactions = jsonData;
      } else if (jsonData && typeof jsonData === 'object' && Array.isArray(jsonData.transactions)) {
        transactions = jsonData.transactions;
        settings = jsonData.settings;
      } else {
        setError("Ошибка: неверный формат файла");
        return;
      }

      for (let i = 0; i < transactions.length; i++) {
        const reason = validateTransaction(transactions[i]);
        if (reason) {
          setError(`Ошибка: некорректная транзакция в позиции ${i + 1} — ${reason}`);
          return;
        }
      }

      this.db.clearAllTransactions(() => {
        Storage.clearTags();
        Storage.clearCategories();

        if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
          if (typeof settings.defaultTag === 'string') {
            Storage.setDefaultTag(settings.defaultTag);
            const tagInput = document.getElementById('default-tag-input');
            if (tagInput) tagInput.value = settings.defaultTag;
            const limitSelect = document.getElementById('transactions-limit');
            if (limitSelect) {
              const existing = limitSelect.querySelector('option[value="default-tag"]');
              const wasSelected = limitSelect.value === 'default-tag';
              if (existing) existing.remove();
              if (settings.defaultTag) {
                const opt = document.createElement('option');
                opt.value = 'default-tag';
                opt.textContent = settings.defaultTag;
                limitSelect.insertBefore(opt, limitSelect.querySelector('option[value="custom"]'));
              } else if (wasSelected) {
                limitSelect.value = 'all';
                Storage.setLimit('all');
              }
            }
          }
          if (['waste', 'ok', 'good'].includes(settings.defaultRate)) {
            Storage.setDefaultRate(settings.defaultRate);
            const rateSelect = document.getElementById('default-rate-select');
            if (rateSelect) rateSelect.value = settings.defaultRate;
          }
          if (['system', 'light', 'dark'].includes(settings.theme)) {
            Storage.setTheme(settings.theme);
            if (settings.theme === 'light' || settings.theme === 'dark') {
              document.documentElement.setAttribute('data-theme', settings.theme);
            } else {
              document.documentElement.removeAttribute('data-theme');
            }
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) themeSelect.value = settings.theme;
          }
        }

        this.db.bulkAddTransactions(transactions, () => {
          this.transactionManager.singleLoadTransactionsRender();
          this.db.readOnlyTransaction([
            (txs) => this.transactionManager.loadAllCategories(txs),
            (txs) => this.transactionManager.loadAllTags(txs)
          ]);
          setSuccess("Успешно импортировано!");
          document.getElementById("file-name-display").textContent = "";
          document.getElementById("file-upload-zone").classList.remove("has-file");
          document.getElementById("input-json").value = "";
        });
      });
    };
    reader.onerror = () => {
      console.error("Ошибка чтения файла");
      setError("Ошибка чтения файла");
    };
    reader.readAsText(file);
  }
}