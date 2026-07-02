// Demo module - loads/clears demo data and manages demo banner UI
import { Storage } from './storage.js';

// Сдвигает даты транзакций на целое число дней так, чтобы самая свежая
// запись попала на «сегодня» (день `now`), сохраняя интервалы между записями.
// Сдвиг по календарным дням через компоненты даты, а не по миллисекундам,
// чтобы переход через DST не уносил полночь на предыдущий день.
export function shiftDemoDates(transactions, now = new Date()) {
  if (!transactions.length) return transactions;
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const maxDate = new Date(Math.max(...transactions.map((t) => t.date)));
  const offsetDays = Math.round((dayStart(now) - dayStart(maxDate)) / 86400000);
  if (offsetDays === 0) return transactions;
  return transactions.map((t) => {
    const d = new Date(t.date);
    const shifted = new Date(
      d.getFullYear(), d.getMonth(), d.getDate() + offsetDays,
      d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()
    );
    return { ...t, date: shifted.getTime() };
  });
}

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
      .then((data) => {
        // Поддерживаем оба формата: { transactions: [...] } и старый [...]
        const transactions = Array.isArray(data)
          ? data
          : (data && Array.isArray(data.transactions) ? data.transactions : null);
        if (!transactions) throw new Error('Demo data has no transactions array');
        return new Promise((resolve) => {
          this.db.clearAllTransactions(() => {
            Storage.clearTags();
            Storage.clearCategories();
            Storage.clearDescriptions();
            const stripped = shiftDemoDates(transactions).map(({ id, ...rest }) => rest);
            this.db.bulkAddTransactions(stripped, () => {
              Storage.setDemoMode(true);
              this.transactionManager.singleLoadTransactionsRender();
              this.db.readOnlyTransaction([
                (txs) => this.transactionManager.loadAllCategories(txs),
                (txs) => this.transactionManager.loadAllTags(txs),
                (txs) => this.transactionManager.loadAllDescriptions(txs),
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
        Storage.clearDescriptions();
        Storage.setDemoMode(false);
        this.transactionManager.singleLoadTransactionsRender();
        this.db.readOnlyTransaction([
          (txs) => this.transactionManager.loadAllCategories(txs),
          (txs) => this.transactionManager.loadAllTags(txs),
          (txs) => this.transactionManager.loadAllDescriptions(txs),
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
