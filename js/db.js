// Database module - handles IndexedDB operations
export class Database {
  constructor() {
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("FinanceTrackerDB", 2);

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        if (!this.db.objectStoreNames.contains("transactions")) {
          let store = this.db.createObjectStore("transactions", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("date_idx", "date");
        } else {
          const transaction = event.target.transaction;
          const store = transaction.objectStore("transactions");

          if (!store.indexNames.contains("date_idx")) {
            store.createIndex("date_idx", "date");
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(new Error("Failed to open database"));
      };
    });
  }

  readOnlyTransaction(functions, onComplete) {
    const tx = this.db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const request = store.getAll();

    request.onsuccess = () => {
      const transactions = request.result;
      functions.forEach((func) => {
        func.call(this, transactions);
      });
    };

    request.onerror = () => {
      console.error("error occured while open indexed db");
    };

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }

  readOnlyTransactionByDate(functions, query, onComplete) {
    if (!(query instanceof IDBKeyRange)) {
      return this.readOnlyTransaction(functions, onComplete);
    }
    const tx = this.db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const index = store.index("date_idx");
    const request = index.getAll(query);

    request.onsuccess = () => {
      const transactions = request.result;
      functions.forEach((func) => {
        func.call(this, transactions);
      });
    };

    request.onerror = () => {
      console.error("error occured while open indexed db");
    };

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }

  addTransaction(transaction, onComplete) {
    const tx = this.db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    store.add(transaction);

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }

  updateTransaction(transaction, onComplete) {
    const tx = this.db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    store.put(transaction);

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }

  deleteTransaction(id, onComplete) {
    const tx = this.db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    store.delete(id);

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }

  clearAllTransactions(onComplete) {
    const tx = this.db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    store.clear();

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }

  bulkAddTransactions(transactions, onComplete) {
    const tx = this.db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    
    transactions.forEach((transaction) => store.add(transaction));

    if (onComplete) {
      tx.oncomplete = onComplete;
    }
  }
}