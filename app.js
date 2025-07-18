let db;
let allCategories;
let allTags;
let tags = [];
let suggestedCategory = "";
let suggestedTag = "";
let tagsToRemove = new Set();
const RATES = new Map(
  Object.entries({
    waste: ["плохая", "#f54242"],
    ok: ["ок", "#4287f5"],
    good: ["осознанная", "#42f58a"],
  })
);
let limit = localStorage.limit ? localStorage.limit : "all";
let chartTarget = localStorage.chartTarget ? localStorage.chartTarget : "category";

// --- db ---
const request = indexedDB.open("FinanceTrackerDB", 2);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains("transactions")) {
    let store = db.createObjectStore("transactions", {
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
  db = event.target.result;
  singleLoadTransactionsRender();
  readOnlyTransaction([loadAllCategories, loadAllTags]);
};

function readOnlyTransactionByDate(functions, query) {
  if (!(query instanceof IDBKeyRange)) {
    return readOnlyTransaction(functions);
  }
  const tx = db.transaction("transactions", "readonly");
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
}

function readOnlyTransaction(functions) {
  const tx = db.transaction("transactions", "readonly");
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
}

// --- Render transactions ---
function loadTransactions(transactions) {
  const list = document.getElementById("transactions");
  const balanceElement = document.getElementById("balance");

  list.innerHTML = "";
  let balance = 0;

  transactions.sort((a, b) => b.date - a.date);

  transactions.forEach((transaction) => {
    const li = document.createElement("li");
    li.className = "transaction-li";
    li.onclick = () => {
      openModal(
        transaction.description,
        `
        <div>
          <strong>Описание</strong> <input id="modal-description-input" value = "${transaction.description}"><br>
          <strong>Сумма</strong> <span><input type="number" id="modal-amount-input" value="${
            transaction.amount
          }"> ₽</span><br>
          <div class="suggestion" style="display: none" id="modal-category-suggestion"></div>
          <strong>Категория</strong> <input id="modal-category-input" value="${transaction.category}"><br>
          <strong>Трата</strong> <select name="rate" id="modal-rate-select">
            <option value="waste">плохая</option>
            <option value="ok">ок</option>
            <option value="good">осознанная</option>
          </select>
          <div><strong>Теги</strong><br>
          <div class="suggestion" style="display: none" id="modal-tag-suggestion"></div>
            <input id="modal-tag-input" placeholder="Добавить тэг?" />
            <button id="modal-add-tag">+</button>
            <div id="modal-tags-list">${transaction.tags
              .map(
                (tag) =>
                  `<span class="tag">${tag} <button class="remove-tag-btn" onclick="tagsToRemove.add('${tag}'); this.parentElement.remove()">×</button></span>`
              )
              .join("")}
            </div>
          <div>
          <strong>Дата</strong> <input class="input-time" id="modal-date-input"> <strong>Время</strong> <input class="input-time" id="modal-time-input">
        </div>
        <div class="column">
          <button id="modal-save-btn">Сохранить изменения</button>
          <button id="modal-delete-btn">Удалить</button>
          <button id="modal-duplicate-btn">Дублировать</button>
        </div>
        `
      );
      const dateInput = document.getElementById("modal-date-input");
      const timeInput = document.getElementById("modal-time-input");
      const dateString = formatDate(new Date(transaction.date), true);
      dateInput.value = dateString.split(" ")[0];
      timeInput.value = dateString.split(" ")[1];
      document.getElementById("modal-rate-select").value = transaction.rate;
      tagsToRemove.clear();

      const modalCategoryInput = document.getElementById("modal-category-input");
      const modalCategorySuggestionDiv = document.getElementById("modal-category-suggestion");
      modalCategorySuggestionDiv.addEventListener("click", () =>
        applySuggestion(modalCategoryInput, modalCategorySuggestionDiv, suggestedCategory)
      );
      modalCategoryInput.addEventListener("input", (event) => {
        const value = event.target.value;

        suggestedCategory = suggestAutocomplete(allCategories, value);

        if (!suggestedCategory) {
          modalCategorySuggestionDiv.style.display = "none";
          return;
        }

        modalCategorySuggestionDiv.textContent = suggestedCategory;
        modalCategorySuggestionDiv.style.display = "block";

        if (value.endsWith("  ")) {
          applySuggestion(modalCategoryInput, modalCategorySuggestionDiv, suggestedCategory);
        }
      });

      const modalTagInput = document.getElementById("modal-tag-input");
      const modalTagSuggestionDiv = document.getElementById("modal-tag-suggestion");
      modalTagSuggestionDiv.addEventListener("click", () =>
        applySuggestion(modalTagInput, modalTagSuggestionDiv, suggestedTag)
      );
      modalTagInput.addEventListener("input", (event) => {
        const value = event.target.value;
        if (value.endsWith("   ")) {
          document.getElementById("modal-add-tag").click();
        }

        suggestedTag = suggestAutocomplete(allTags, value, [...transaction.tags, ...tags]);
        if (!suggestedTag) {
          modalTagSuggestionDiv.style.display = "none";
          return;
        }

        modalTagSuggestionDiv.textContent = suggestedTag;
        modalTagSuggestionDiv.style.display = "block";

        if (value.endsWith("  ")) {
          applySuggestion(modalTagInput, modalTagSuggestionDiv, suggestedTag);
        }
      });
      document.getElementById("modal-add-tag").addEventListener("click", () => {
        const value = modalTagInput.value.trim();
        if (!value || transaction.tags.includes(value) || tags.includes(value)) {
          modalTagInput.value = "";
          return;
        }
        tags.push(value);

        document
          .getElementById("modal-tags-list")
          .insertAdjacentHTML(
            "beforeend",
            `<span class="tag">${value} <button class="remove-tag-btn" onclick="tagsToRemove.add('${value}'); this.parentElement.remove()">×</button></span>`
          );
        modalTagInput.value = "";
      });

      document.getElementById("modal-save-btn").addEventListener("click", () => {
        transaction.description = document.getElementById("modal-description-input").value;

        if (transaction.category !== modalCategoryInput.value) {
          countMapDec(allCategories, transaction.category);
          transaction.category = modalCategoryInput.value;
          countMapInc(allCategories, transaction.category);
          saveCategories();
        }

        transaction.amount = +document.getElementById("modal-amount-input").value;
        transaction.rate = document.getElementById("modal-rate-select").value;

        tags.forEach((tag) => {
          countMapInc(allTags, tag);
        });
        transaction.tags
          .filter((tag) => tagsToRemove.has(tag))
          .forEach((tag) => {
            countMapDec(allTags, tag);
          });
        saveTags();
        transaction.tags = transaction.tags.filter((tag) => !tagsToRemove.has(tag));
        transaction.tags.push(...tags);

        const year = new Date(transaction.date).getFullYear();
        const day = dateInput.value.split(".")[0];
        const month = dateInput.value.split(".")[1] - 1;
        const hour = timeInput.value.split(":")[0];
        const minute = timeInput.value.split(":")[1];
        const second = new Date(transaction.date).getSeconds();
        transaction.date = new Date(year, month, day, hour, minute, second).getTime();

        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");

        store.put(transaction);

        tx.oncomplete = () => {
          singleLoadTransactionsRender();
        };
        tags.splice(0, tags.length);
        tagsToRemove.clear();
        closeModal();
      });

      document.getElementById("modal-delete-btn").addEventListener("click", () => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");

        store.delete(transaction.id);
        countMapDec(allCategories, transaction.category);
        saveCategories();

        transaction.tags.forEach((tag) => {
          countMapDec(allTags, tag);
        });
        saveTags();

        tx.oncomplete = () => {
          singleLoadTransactionsRender();
        };
        tags.splice(0, tags.length);
        tagsToRemove.clear();
        closeModal();
      });

      document.getElementById("modal-duplicate-btn").addEventListener("click", () => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");

        const toAdd = Object.assign({}, transaction);
        delete toAdd.id;
        toAdd.date = new Date().getTime();
        countMapInc(allCategories, toAdd.category);
        saveCategories();
        toAdd.tags.forEach((tag) => {
          countMapInc(allTags, tag);
        });
        saveTags();
        store.add(toAdd);

        tx.oncomplete = () => {
          singleLoadTransactionsRender();
        };
        tags.splice(0, tags.length);
        tagsToRemove.clear();
        closeModal();
      });
    };
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
  const chartObject = groupTransactions(transactions, chartTarget);
  if (chartTarget === "tags") {
    updateCharts(chartObject, "bar");
    const barChart = Chart.getChart("chart");
    barChart.data.datasets[0].label = "Сумма транзакций по тегам";
    barChart.options = {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    };
    barChart.update();
  } else {
    updateCharts(chartObject);
  }
  if (chartTarget === "rate") {
    let colors = [];

    for (const key in chartObject) {
      colors.push(RATES.get(key)[1]);
      chartObject[RATES.get(key)[0]] = chartObject[key];
      delete chartObject[key];
    }
    const pieChart = Chart.getChart("chart");
    pieChart.data.labels = Object.keys(chartObject);
    pieChart.data.datasets[0].backgroundColor = colors;
    pieChart.update();
  }
}

function singleLoadTransactionsRender() {
  const period = getDateRange(limit);
  if (period.start.getTime() === period.end.getTime()) {
    readOnlyTransaction([loadTransactions]);
  } else {
    readOnlyTransactionByDate(
      [loadTransactions],
      IDBKeyRange.bound(period.start.getTime(), period.end.getTime(), true, true)
    );
  }
}

function loadAllCategories(transactions) {
  if (localStorage.categories) {
    allCategories = new Map(Object.entries(JSON.parse(localStorage.categories)));
    return;
  }

  allCategories = new Map();
  transactions.forEach((t) => {
    countMapInc(allCategories, t.category);
  });

  saveCategories();
}

function loadAllTags(transactions) {
  if (localStorage.tags) {
    allTags = new Map(Object.entries(JSON.parse(localStorage.tags)));
    return;
  }

  allTags = new Map();
  transactions
    .flatMap((t) => t.tags)
    .forEach((t) => {
      countMapInc(allTags, t);
    });

  saveTags();
}

// --- Input Transaction From ---
document.getElementById("transaction-form").addEventListener("submit", (e) => {
  if (tagInput.value.trim()) {
    document.getElementById("add-tag").dispatchEvent(new Event("click"));
  }

  e.preventDefault();

  const transaction = {
    description: document.getElementById("description").value,
    amount: +document.getElementById("amount").value,
    category: document.getElementById("category-input").value,
    rate: document.getElementById("rate-select").value,
    tags: [...tags],
    date: new Date().getTime(),
  };

  const tx = db.transaction("transactions", "readwrite");
  const store = tx.objectStore("transactions");
  store.add(transaction);

  countMapInc(allCategories, transaction.category);
  saveCategories();
  tags
    .flat((tags) => tags)
    .forEach((tag) => {
      countMapInc(allTags, tag);
    });
  saveTags();
  tx.oncomplete = () => {
    singleLoadTransactionsRender();
    e.target.reset();
    tags.splice(0, tags.length);
    renderTags();
  };
  showPage("home");
});

// --- Utils ---
function saveTags() {
  localStorage.tags = JSON.stringify(Object.fromEntries(allTags));
}

function saveCategories() {
  localStorage.categories = JSON.stringify(Object.fromEntries(allCategories));
}

function unionStart(inputText, src) {
  if (inputText.length >= src.length || inputText.length == 0) {
    return -1;
  }
  let i = 0;
  while (i < inputText.length && i < src.length) {
    if (inputText[i] !== src[i]) {
      return -1;
    }
    i++;
  }
  return i;
}

function countMapInc(map, object) {
  if (!map.has(object)) {
    map.set(object, 1);
    return;
  }
  map.set(object, map.get(object) + 1);
}

function countMapDec(map, object) {
  if (map.get(object) === 1) {
    map.delete(object);
    return;
  }
  map.set(object, map.get(object) - 1);
}

function formatDate(date, day = false) {
  let dd = date.getDate();
  if (dd < 10) dd = "0" + dd;
  let mm = date.getMonth() + 1;
  if (mm < 10) mm = "0" + mm;
  if (day) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${dd}.${mm} ${hours}:${minutes}`;
  }
  const yy = date.getFullYear();
  return dd + "." + mm + "." + yy;
}

function getDateRange(period = "day", date = new Date()) {
  const result = { start: new Date(date), end: new Date(date) };

  switch (period) {
    case "day":
      result.start.setHours(0, 0, 0, 0);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "week":
      const day = date.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      result.start.setDate(date.getDate() + diffToMonday);
      result.start.setHours(0, 0, 0, 0);
      result.end = new Date(result.start);
      result.end.setDate(result.start.getDate() + 6);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "month":
      result.start = new Date(date.getFullYear(), date.getMonth(), 1);
      result.end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "year":
      result.start = new Date(date.getFullYear(), 0, 1);
      result.end = new Date(date.getFullYear(), 11, 31);
      result.end.setHours(23, 59, 59, 999);
      break;
  }
  return result;
}

function groupTransactions(transactions, target) {
  const result = {};
  transactions.forEach((t) => {
    if (Array.isArray(t[target])) {
      t[target].forEach((tag) => {
        if (!result[tag]) {
          result[tag] = 0;
        }
        result[tag] += t.amount;
      });
    } else {
      if (!result[t[target]]) {
        result[t[target]] = 0;
      }
      result[t[target]] += t.amount;
    }
  });
  return result;
}

function updateCharts(object, type = "pie") {
  const chart = Chart.getChart("chart");
  if (chart) {
    chart.destroy();
  }
  new Chart(document.getElementById("chart"), {
    type: type,
    data: {
      labels: Object.keys(object),
      datasets: [
        {
          data: Object.values(object),
        },
      ],
    },
  });
}

function capitalize(str) {
  if (!str) return "";
  return str[0].toUpperCase() + str.slice(1).toLowerCase();
}

// --- DOM ---
const categoryInput = document.getElementById("category-input");
const categorySuggestionDiv = document.getElementById("category-suggestion");
categorySuggestionDiv.addEventListener("click", () =>
  applySuggestion(categoryInput, categorySuggestionDiv, suggestedCategory)
);

const tagInput = document.getElementById("tag-input");
const tagSuggestionDiv = document.getElementById("tag-suggestion");
tagSuggestionDiv.addEventListener("click", () => applySuggestion(tagInput, tagSuggestionDiv, suggestedTag));

function applySuggestion(input, div, suggestion) {
  input.value = suggestion;
  div.style.display = "none";
}

categoryInput.addEventListener("input", (event) => {
  const value = event.target.value;

  suggestedCategory = suggestAutocomplete(allCategories, value);

  if (!suggestedCategory) {
    categorySuggestionDiv.style.display = "none";
    return;
  }

  categorySuggestionDiv.textContent = suggestedCategory;
  categorySuggestionDiv.style.display = "block";

  if (value.endsWith("  ")) {
    applySuggestion(categoryInput, categorySuggestionDiv, suggestedCategory);
  }
});

tagInput.addEventListener("input", (event) => {
  const value = event.target.value;

  if (value.endsWith("   ")) {
    document.getElementById("add-tag").click();
  }

  suggestedTag = suggestAutocomplete(allTags, value);

  if (!suggestedTag) {
    tagSuggestionDiv.style.display = "none";
    return;
  }

  tagSuggestionDiv.textContent = suggestedTag;
  tagSuggestionDiv.style.display = "block";

  if (value.endsWith("  ")) {
    applySuggestion(tagInput, tagSuggestionDiv, suggestedTag);
  }
});
const transactionLimitSelect = document.getElementById("transactions-limit");
transactionLimitSelect.value = limit;
transactionLimitSelect.addEventListener("change", (event) => {
  const value = event.target.value;
  localStorage.limit = value;
  limit = value;

  singleLoadTransactionsRender();
});
const chartTargetSelect = document.getElementById("chart-target");
chartTargetSelect.value = chartTarget;
chartTargetSelect.addEventListener("change", (event) => {
  const value = event.target.value;
  localStorage.chartTarget = value;
  chartTarget = value;

  singleLoadTransactionsRender();
});

// -- export and import data --
document.getElementById("export-btn").addEventListener("click", () => {
  readOnlyTransaction([
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
});

document.getElementById("import-btn").addEventListener("click", () => {
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
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");

        store.clear();
        delete localStorage.tags;
        delete localStorage.categories;
        jsonData.forEach((transaction) => store.add(transaction));

        tx.oncomplete = () => {
          singleLoadTransactionsRender();
          readOnlyTransaction([loadAllCategories, loadAllTags]);
        };
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
});

// -- modal window --
const modal = document.getElementById("modal");
const closeBtn = document.querySelector(".close-btn");

function openModal(title, contentHTML) {
  document.getElementById("modal-title").textContent = capitalize(title);
  document.getElementById("modal-body").innerHTML = contentHTML;
  modal.classList.add("show");
  document.body.style.overflow = "hidden"; // Блокируем прокрутку страницы
}

function closeModal() {
  modal.classList.remove("show");
  document.body.style.overflow = "auto"; // Восстанавливаем прокрутку
  tags.splice(0, tags.length);
}

closeBtn.addEventListener("click", closeModal);

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// --- api with DOM ---
function renderTags() {
  const container = document.getElementById("tags-container");
  container.innerHTML = tags
    .map((tag) => `<span class="tag">${tag} <button class="remove-tag-btn" onclick="removeTag('${tag}')">×</button></span>`)
    .join("");
}

// --- api ---
function suggestAutocomplete(sourceMap, inputText, excludeList = []) {
  let unionCount = 0;
  let weight = 0;
  let suggestion = null;

  inputText = inputText.trim().toLowerCase();
  sourceMap.forEach((v, k) => {
    if (!excludeList.includes(k)) {
      const lower = k.toLowerCase();
      const count = unionStart(inputText, lower);
      if (count > unionCount || (count === unionCount && v > weight)) {
        suggestion = k;
        weight = v;
        unionCount = count;
      }
    }
  });

  return suggestion;
}

// -- tags --
const removeTag = (tag) => {
  tags = tags.filter((t) => t !== tag);
  renderTags();
};

document.getElementById("add-tag").addEventListener("click", () => {
  const value = tagInput.value.trim();
  if (!value || tags.includes(value)) {
    tagInput.value = "";
    return;
  }
  tags.push(value);
  renderTags();
  tagInput.value = "";
});

// --- Pages and nav ---
function showPage(pageId) {
  localStorage.page = pageId;
  document.querySelectorAll(".page").forEach((page) => {
    page.style.display = "none";
  });
  document.getElementById(`${pageId}-page`).style.display = "block";

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });
  document.querySelector(`.nav-item[data-page="${pageId}"]`).classList.add("active");
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const pageId = item.getAttribute("data-page");
    showPage(pageId);
  });
});

showPage(localStorage.page ? localStorage.page : "home");
