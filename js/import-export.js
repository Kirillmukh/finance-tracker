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
        const json = JSON.stringify({ transactions });
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

      // Поддерживаем два формата: новый { transactions: [...] } и старый [...]
      const transactions = Array.isArray(jsonData)
        ? jsonData
        : (jsonData && Array.isArray(jsonData.transactions) ? jsonData.transactions : null);

      if (!transactions) {
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