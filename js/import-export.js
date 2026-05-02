// Import/Export module - handles data import and export
import { formatDate } from './utils.js';
import { Storage } from './storage.js';

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
        const json = JSON.stringify(transactions);
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

    if (!file) {
      document.getElementById("import-status").textContent = "Файл не выбран!";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        if (Array.isArray(jsonData)) {
          this.db.clearAllTransactions(() => {
            Storage.clearTags();
            Storage.clearCategories();
            this.db.bulkAddTransactions(jsonData, () => {
              this.transactionManager.singleLoadTransactionsRender();
              this.db.readOnlyTransaction([
                (transactions) => this.transactionManager.loadAllCategories(transactions),
                (transactions) => this.transactionManager.loadAllTags(transactions)
              ]);
            });
          });
        }
      } catch (error) {
        console.error(error);
      }
    };
    reader.onerror = () => {
      console.error("Ошибка чтения файла");
    };
    reader.readAsText(file);

    document.getElementById("import-status").textContent = "Успешно импортировано!";
    document.getElementById("file-name-display").textContent = "";
    document.getElementById("file-upload-zone").classList.remove("has-file");
    document.getElementById("input-json").value = "";
  }
}