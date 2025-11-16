// Transactions module - handles transaction operations and rendering
import { RATES, formatDate, groupTransactions, getDateRange, countMapInc, countMapDec } from './utils.js';
import { updateCharts, updateChartForRates, updateChartForTags, setLegendClickCallback, getHiddenCategories, clearHiddenCategories } from './chart.js';
import { Storage } from './storage.js';

export class TransactionManager {
  constructor(db, ui, modal, navigation) {
    this.db = db;
    this.ui = ui;
    this.modal = modal;
    this.navigation = navigation;
    this.allCategories = null;
    this.allTags = null;
    this.limit = Storage.getLimit();
    this.chartTarget = Storage.getChartTarget();
    this.currentTransactions = [];
  }

  async init() {
    await this.db.init();
    
    // Set up legend click callback to update balance
    setLegendClickCallback(() => {
      this.updateBalanceWithHiddenCategories();
    });
    
    this.singleLoadTransactionsRender();
    
    // Wait for categories and tags to load before continuing
    await new Promise((resolve) => {
      this.db.readOnlyTransaction([
        (transactions) => this.loadAllCategories(transactions),
        (transactions) => this.loadAllTags(transactions)
      ], resolve);
    });
  }

  loadAllCategories(transactions) {
    const stored = Storage.loadCategories();
    if (stored) {
      this.allCategories = stored;
      return;
    }

    this.allCategories = new Map();
    transactions.forEach((t) => {
      countMapInc(this.allCategories, t.category);
    });

    Storage.saveCategories(this.allCategories);
  }

  loadAllTags(transactions) {
    const stored = Storage.loadTags();
    if (stored) {
      this.allTags = stored;
      return;
    }

    this.allTags = new Map();
    transactions
      .flatMap((t) => t.tags)
      .forEach((t) => {
        countMapInc(this.allTags, t);
      });

    Storage.saveTags(this.allTags);
  }

  loadTransactions(transactions) {
    this.currentTransactions = transactions;
    const list = document.getElementById("transactions");
    const balanceElement = document.getElementById("balance");

    list.innerHTML = "";
    let balance = 0;

    transactions.sort((a, b) => b.date - a.date);

    transactions.forEach((transaction) => {
      const li = document.createElement("li");
      li.className = "transaction-li";
      li.onclick = () => this.openTransactionModal(transaction);
      li.innerHTML = `
        <div>
          <strong>${transaction.description}</strong>
          <div>${transaction.category} ${transaction.tags.length !== 0 ? "•" : ""} ${transaction.tags.join(", ")}</div>
        </div>
        <div>
          <span style="white-space: nowrap">${transaction.amount} ₽</span>
          <div style="text-align: end; color: ${RATES.get(transaction.rate)[1]}">{x}</div>
        </div>
      `;
      list.appendChild(li);

      balance += transaction.amount;
    });

    balanceElement.textContent = balance;
    
    // Clear hidden categories when loading new data
    clearHiddenCategories();
    
    const chartObject = groupTransactions(transactions, this.chartTarget);
    
    if (this.chartTarget === "tags") {
      updateCharts(chartObject, "bar");
      updateChartForTags();
    } else {
      updateCharts(chartObject);
    }
    
    if (this.chartTarget === "rate") {
      updateChartForRates(chartObject);
    }
  }

  updateBalanceWithHiddenCategories() {
    const balanceElement = document.getElementById("balance");
    const hiddenCategories = getHiddenCategories();
    
    let balance = 0;
    
    this.currentTransactions.forEach((transaction) => {
      // Determine which field to check based on chartTarget
      let shouldInclude = true;
      
      if (this.chartTarget === "category") {
        shouldInclude = !hiddenCategories.has(transaction.category);
      } else if (this.chartTarget === "rate") {
        const rateName = RATES.get(transaction.rate)[0];
        shouldInclude = !hiddenCategories.has(rateName);
      } else if (this.chartTarget === "tags") {
        // For tags, include transaction if it has at least one non-hidden tag
        // or if it has no tags and "Без тегов" is not hidden
        if (transaction.tags.length === 0) {
          shouldInclude = !hiddenCategories.has("Без тегов");
        } else {
          shouldInclude = transaction.tags.some(tag => !hiddenCategories.has(tag));
        }
      }
      
      if (shouldInclude) {
        balance += transaction.amount;
      }
    });
    
    balanceElement.textContent = balance;
  }

  openTransactionModal(transaction) {
    this.modal.open(
      transaction.description,
      this.ui.createTransactionModalContent(transaction)
    );
    
    const dateInput = document.getElementById("modal-date-input");
    const timeInput = document.getElementById("modal-time-input");
    const date = new Date(transaction.date);
    
    // Format date as YYYY-MM-DD for date input
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
    
    // Format time as HH:MM for time input
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    timeInput.value = `${hours}:${minutes}`;
    
    document.getElementById("modal-rate-select").value = transaction.rate;
    this.ui.clearTagsToRemove();

    this.ui.setupModalAutocomplete(this.allCategories, this.allTags, transaction);
    this.ui.setupModalTagHandling(transaction);

    this.setupModalButtons(transaction);
  }

  setupModalButtons(transaction) {
    document.getElementById("modal-save-btn").addEventListener("click", () => {
      this.saveTransaction(transaction);
    });

    document.getElementById("modal-delete-btn").addEventListener("click", () => {
      this.deleteTransaction(transaction);
    });

    document.getElementById("modal-duplicate-btn").addEventListener("click", () => {
      this.duplicateTransaction(transaction);
    });
  }

  saveTransaction(transaction) {
    transaction.description = document.getElementById("modal-description-input").value;

    const modalCategoryInput = document.getElementById("modal-category-input");
    if (transaction.category !== modalCategoryInput.value) {
      countMapDec(this.allCategories, transaction.category);
      transaction.category = modalCategoryInput.value;
      countMapInc(this.allCategories, transaction.category);
      Storage.saveCategories(this.allCategories);
    }

    transaction.amount = +document.getElementById("modal-amount-input").value;
    transaction.rate = document.getElementById("modal-rate-select").value;

    this.ui.getTags().forEach((tag) => {
      countMapInc(this.allTags, tag);
    });
    transaction.tags
      .filter((tag) => this.ui.getTagsToRemove().has(tag))
      .forEach((tag) => {
        countMapDec(this.allTags, tag);
      });
    Storage.saveTags(this.allTags);
    transaction.tags = transaction.tags.filter((tag) => !this.ui.getTagsToRemove().has(tag));
    transaction.tags.push(...this.ui.getTags());

    const dateInput = document.getElementById("modal-date-input");
    const timeInput = document.getElementById("modal-time-input");
    
    // Parse date from YYYY-MM-DD format
    const dateParts = dateInput.value.split("-");
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[2]);
    
    // Parse time from HH:MM format
    const timeParts = timeInput.value.split(":");
    const hour = parseInt(timeParts[0]);
    const minute = parseInt(timeParts[1]);
    const second = new Date(transaction.date).getSeconds();
    
    transaction.date = new Date(year, month, day, hour, minute, second).getTime();

    this.db.updateTransaction(transaction, () => {
      this.singleLoadTransactionsRender();
    });
    
    this.ui.clearTags();
    this.ui.clearTagsToRemove();
    this.modal.close();
  }

  deleteTransaction(transaction) {
    this.db.deleteTransaction(transaction.id, () => {
      this.singleLoadTransactionsRender();
    });
    
    countMapDec(this.allCategories, transaction.category);
    Storage.saveCategories(this.allCategories);

    transaction.tags.forEach((tag) => {
      countMapDec(this.allTags, tag);
    });
    Storage.saveTags(this.allTags);

    this.ui.clearTags();
    this.ui.clearTagsToRemove();
    this.modal.close();
  }

  duplicateTransaction(transaction) {
    const toAdd = Object.assign({}, transaction);
    delete toAdd.id;
    toAdd.date = new Date().getTime();
    
    countMapInc(this.allCategories, toAdd.category);
    Storage.saveCategories(this.allCategories);
    
    toAdd.tags.forEach((tag) => {
      countMapInc(this.allTags, tag);
    });
    Storage.saveTags(this.allTags);
    
    this.db.addTransaction(toAdd, () => {
      this.singleLoadTransactionsRender();
    });

    this.ui.clearTags();
    this.ui.clearTagsToRemove();
    this.modal.close();
  }

  singleLoadTransactionsRender() {
    let customStart = null;
    let customEnd = null;
    
    if (this.limit === "custom") {
      const startInput = document.getElementById("custom-start-date");
      const endInput = document.getElementById("custom-end-date");
      
      if (startInput && startInput.value) {
        customStart = startInput.value;
        // If end date is not specified, use today's date
        customEnd = endInput && endInput.value ? endInput.value : new Date().toISOString().split('T')[0];
      }
    }
    
    const period = getDateRange(this.limit, new Date(), customStart, customEnd);
    if (period.start.getTime() === period.end.getTime()) {
      this.db.readOnlyTransaction([(transactions) => this.loadTransactions(transactions)]);
    } else {
      this.db.readOnlyTransactionByDate(
        [(transactions) => this.loadTransactions(transactions)],
        IDBKeyRange.bound(period.start.getTime(), period.end.getTime(), true, true)
      );
    }
  }

  setupTransactionForm() {
    document.getElementById("transaction-form").addEventListener("submit", (e) => {
      const tagInput = document.getElementById("tag-input");
      if (tagInput.value.trim()) {
        document.getElementById("add-tag").dispatchEvent(new Event("click"));
      }

      e.preventDefault();

      const transaction = {
        description: document.getElementById("description").value,
        amount: +document.getElementById("amount").value,
        category: document.getElementById("category-input").value,
        rate: document.getElementById("rate-select").value,
        tags: [...this.ui.getTags()],
        date: new Date().getTime(),
      };

      this.db.addTransaction(transaction, () => {
        this.singleLoadTransactionsRender();
        e.target.reset();
        this.ui.clearTags();
        this.ui.renderTags();
      });

      countMapInc(this.allCategories, transaction.category);
      Storage.saveCategories(this.allCategories);
      
      transaction.tags.forEach((tag) => {
        countMapInc(this.allTags, tag);
      });
      Storage.saveTags(this.allTags);

      this.navigation.showPage("home");
    });
  }

  setupLimitSelect() {
    const transactionLimitSelect = document.getElementById("transactions-limit");
    const customPeriodInputs = document.getElementById("custom-period-inputs");
    const startDateInput = document.getElementById("custom-start-date");
    const endDateInput = document.getElementById("custom-end-date");
    
    transactionLimitSelect.value = this.limit;
    
    // Show/hide custom period inputs based on initial value
    if (this.limit === "custom") {
      customPeriodInputs.style.display = "flex";
    }
    
    transactionLimitSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      Storage.setLimit(value);
      this.limit = value;
      
      // Show/hide custom period inputs
      if (value === "custom") {
        customPeriodInputs.style.display = "flex";
      } else {
        customPeriodInputs.style.display = "none";
        this.singleLoadTransactionsRender();
      }
    });
    
    // Add event listeners to date inputs
    const handleDateChange = () => {
      if (this.limit === "custom" && startDateInput.value) {
        this.singleLoadTransactionsRender();
      }
    };
    
    startDateInput.addEventListener("change", handleDateChange);
    endDateInput.addEventListener("change", handleDateChange);
  }

  setupChartTargetSelect() {
    const chartTargetSelect = document.getElementById("chart-target");
    chartTargetSelect.value = this.chartTarget;
    chartTargetSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      Storage.setChartTarget(value);
      this.chartTarget = value;
      this.singleLoadTransactionsRender();
    });
  }

  getAllCategories() {
    return this.allCategories;
  }

  getAllTags() {
    return this.allTags;
  }
}