// Demo module - loads/clears demo data and manages demo banner UI
import { Storage } from './storage.js';

export class Demo {
  constructor(db, transactionManager) {
    this.db = db;
    this.transactionManager = transactionManager;
  }

  isDemo() {
    return Storage.getDemoMode();
  }

  loadDemoData() {
    return fetch('./demo-data.json')
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch demo data');
        return response.json();
      })
      .then((transactions) => {
        if (!Array.isArray(transactions)) throw new Error('Demo data is not an array');
        return new Promise((resolve) => {
          this.db.clearAllTransactions(() => {
            Storage.clearTags();
            Storage.clearCategories();
            const stripped = transactions.map(({ id, ...rest }) => rest);
            this.db.bulkAddTransactions(stripped, () => {
              Storage.setDemoMode(true);
              this.transactionManager.singleLoadTransactionsRender();
              this.db.readOnlyTransaction([
                (txs) => this.transactionManager.loadAllCategories(txs),
                (txs) => this.transactionManager.loadAllTags(txs),
              ], resolve);
            });
          });
        });
      });
  }

  clearDemoData() {
    return new Promise((resolve) => {
      this.db.clearAllTransactions(() => {
        Storage.clearTags();
        Storage.clearCategories();
        Storage.setDemoMode(false);
        this.transactionManager.singleLoadTransactionsRender();
        this.db.readOnlyTransaction([
          (txs) => this.transactionManager.loadAllCategories(txs),
          (txs) => this.transactionManager.loadAllTags(txs),
        ], resolve);
      });
    });
  }
}

export function setupDemoUI(demo) {
  const banner = document.getElementById('demo-banner');
  const clearBtn = document.getElementById('demo-clear-btn');

  const updateBanner = () => {
    banner.style.display = demo.isDemo() ? 'flex' : 'none';
  };

  clearBtn.addEventListener('click', () => {
    if (!confirm('Очистить все данные и начать с нуля?')) return;
    demo.clearDemoData().then(updateBanner);
  });

  window.loadDemo = () => {
    demo.loadDemoData().then(updateBanner);
  };

  updateBanner();
}
