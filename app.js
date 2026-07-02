// Main application entry point
import { Database } from './js/db.js';
import { UI } from './js/ui.js';
import { Modal } from './js/modal.js';
import { Navigation } from './js/navigation.js';
import { TransactionManager } from './js/transactions.js';
import { ImportExport } from './js/import-export.js';
import { Storage } from './js/storage.js';
import { setupRenameTagUI } from './js/rename-tag.js';
import { Demo, setupDemoUI } from './js/demo.js';
import { setupFooter } from './js/footer.js';
import { toDateInputValue, toTimeInputValue } from './js/utils.js';

// Initialize application
async function initApp() {
  // Create instances
  const db = new Database();
  const modal = new Modal();
  const navigation = new Navigation();
  const ui = new UI(modal);
  const transactionManager = new TransactionManager(db, ui, modal, navigation);
  const importExport = new ImportExport(db, transactionManager);
  const demo = new Demo(db, transactionManager);

  // Initialize transaction manager (this now waits for categories and tags to load)
  await transactionManager.init();

  // Setup UI components - data is now guaranteed to be loaded
  ui.setupCategoryInput(transactionManager.getAllCategories());
  ui.setupTagInput(transactionManager.getAllTags());
  ui.setupDescriptionInput(transactionManager.getAllDescriptions());

  // Setup transaction form
  transactionManager.setupTransactionForm();
  transactionManager.setupLimitSelect();
  transactionManager.setupChartTargetSelect();

  // Initialize navigation
  navigation.init();

  // Bottom nav: swipe to switch tabs, sliding indicator, compact on scroll
  setupFooter(navigation);

  // Default rate selector
  const defaultRateSelect = document.getElementById('default-rate-select');
  defaultRateSelect.value = Storage.getDefaultRate();
  defaultRateSelect.addEventListener('change', () => {
    Storage.setDefaultRate(defaultRateSelect.value);
  });

  // Apply default rate to form
  const applyDefaultRate = () => {
    document.getElementById('rate-select').value = Storage.getDefaultRate();
  };

  // Pre-fill date/time inputs with the current moment
  const applyCurrentDateTime = () => {
    const now = new Date();
    document.getElementById('date-input').value = toDateInputValue(now);
    document.getElementById('time-input').value = toTimeInputValue(now);
  };

  // Reset button on the transaction form — clear everything and re-apply
  // the same defaults as after a successful submit
  document.getElementById('form-reset-btn').addEventListener('click', () => {
    document.getElementById('transaction-form').reset();
    document.getElementById('description-suggestion').style.display = 'none';
    document.getElementById('category-suggestion').style.display = 'none';
    document.getElementById('tag-suggestion').style.display = 'none';
    ui.clearTags();
    ui.renderTags();
    ui.initDefaultTag(Storage.getDefaultTag());
    applyDefaultRate();
    applyCurrentDateTime();
  });

  // Fill the form with defaults once at app load. Navigation must NOT touch
  // form values — they persist until submit or the reset button.
  ui.initDefaultTag(Storage.getDefaultTag());
  applyDefaultRate();
  applyCurrentDateTime();

  // Theme selector
  const themeSelect = document.getElementById('theme-select');
  themeSelect.value = Storage.getTheme();
  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    Storage.setTheme(theme);
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });

  // Load saved default tag into settings input
  document.getElementById('default-tag-input').value = Storage.getDefaultTag();

  // Setup default tag save
  document.getElementById('default-tag-save-btn').addEventListener('click', () => {
    const value = document.getElementById('default-tag-input').value.trim();
    const oldValue = Storage.getDefaultTag();
    Storage.setDefaultTag(value);

    if (value !== oldValue) {
      const limitSelect = document.getElementById('transactions-limit');
      const existing = limitSelect.querySelector('option[value="default-tag"]');
      const wasDefaultTagSelected = limitSelect.value === 'default-tag';
      if (existing) existing.remove();
      if (value) {
        const option = document.createElement('option');
        option.value = 'default-tag';
        option.textContent = value;
        limitSelect.insertBefore(option, limitSelect.querySelector('option[value="custom"]'));
      } else if (wasDefaultTagSelected) {
        limitSelect.value = 'all';
        Storage.setLimit('all');
        transactionManager.limit = 'all';
        transactionManager.singleLoadTransactionsRender();
      }
    }

    const status = document.getElementById('default-tag-status');
    status.textContent = value ? `Тег "${value}" сохранён` : 'Тег по умолчанию удалён';
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; status.textContent = ''; }, 2000);
  });

  // Rename tag
  setupRenameTagUI(transactionManager, transactionManager.getAllTags());

  // Demo mode
  setupDemoUI(demo);

  // ?demo=1 entry point from landing — load demo data via window.loadDemo
  // (which also updates the banner), then strip the query so a refresh
  // doesn't re-trigger it.
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') {
    history.replaceState(null, '', location.pathname);
    if (!demo.isDemo()) window.loadDemo();
  }

  // Mark this visitor as returning so future visits skip landing.html
  try { localStorage.setItem('hasVisited', '1'); } catch (_) {}

  // Legend toggle
  document.getElementById('legend-toggle').addEventListener('click', () => {
    const legend = document.getElementById('chart-legend');
    const btn = document.getElementById('legend-toggle');
    const isHidden = legend.classList.toggle('legend-hidden');
    btn.textContent = isHidden ? 'Категории ▾' : 'Категории ▴';
  });

  // Expose functions to global scope for onclick handlers
  window.removeTag = (tag) => ui.removeTag(tag);
  window.modalRemoveTag = (tag) => {
    ui.modalRemoveTag(tag);
    // Remove the tag element from DOM
    event.target.parentElement.remove();
  };
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
