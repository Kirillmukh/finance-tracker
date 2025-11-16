// Main application entry point
import { Database } from './js/db.js';
import { UI } from './js/ui.js';
import { Modal } from './js/modal.js';
import { Navigation } from './js/navigation.js';
import { TransactionManager } from './js/transactions.js';
import { ImportExport } from './js/import-export.js';

// Initialize application
async function initApp() {
  // Create instances
  const db = new Database();
  const modal = new Modal();
  const navigation = new Navigation();
  const ui = new UI(modal);
  const transactionManager = new TransactionManager(db, ui, modal, navigation);
  const importExport = new ImportExport(db, transactionManager);

  // Initialize transaction manager (this now waits for categories and tags to load)
  await transactionManager.init();

  // Setup UI components - data is now guaranteed to be loaded
  ui.setupCategoryInput(transactionManager.getAllCategories());
  ui.setupTagInput(transactionManager.getAllTags());

  // Setup transaction form
  transactionManager.setupTransactionForm();
  transactionManager.setupLimitSelect();
  transactionManager.setupChartTargetSelect();

  // Initialize navigation
  navigation.init();

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
