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
    ok: ["ок", "#42f58a"],
    good: ["осознанная", "#4287f5"],
  })
);
let limit = localStorage.limit ? localStorage.limit : "all";

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
          <strong>Категория</strong> <input id="modal-category-input" value="${transaction.category}"><br>
          <strong>Трата</strong> <select name="rate" id="modal-rate-select">
            <option value="waste">плохая</option>
            <option value="ok">ок</option>
            <option value="good">осознанная</option>
          </select>
          <div><strong>Теги</strong><br>
            <input id="modal-tag-input" placeholder="Добавить тэг?" />
            <button id="modal-add-tag">+</button>
            <div id="modal-tags-list">${transaction.tags
              .map(
                (tag) =>
                  `<span class="tag">${tag} <button onclick="tagsToRemove.add('${tag}'); this.parentElement.remove()">×</button></span>`
              )
              .join("")}
            </div>
          <div>
          <strong>Дата</strong> <input id="modal-date-input"><strong>Время</strong> <input id="modal-time-input">
        </div>
        <button id="modal-save-btn">Сохранить изменения</button>
        <button id="modal-delete-btn">Удалить</button>
        <button id="modal-duplicate-btn">Дублировать</button>
        `
      );
      const dateInput = document.getElementById("modal-date-input");
      const timeInput=  document.getElementById("modal-time-input");
      const dateString = formatDate(new Date(transaction.date), true);
      dateInput.value = dateString.split(" ")[0];
      timeInput.value = dateString.split(" ")[1];
      document.getElementById("modal-rate-select").value = transaction.rate;
      tagsToRemove.clear();

      document.getElementById("modal-add-tag").addEventListener("click", () => {
        const inputTag = document.getElementById("modal-tag-input");
        if (!inputTag.value || transaction.tags.includes(inputTag.value)) {
          inputTag.value = "";
          return;
        }
        tags.push(inputTag.value);

        document
          .getElementById("modal-tags-list")
          .insertAdjacentHTML(
            "beforeend",
            `<span class="tag">${inputTag.value} <button onclick="tagsToRemove.add('${inputTag.value}'); this.parentElement.remove()">×</button></span>`
          );
        inputTag.value = "";
      });

      document.getElementById("modal-save-btn").addEventListener("click", () => {
        transaction.description = document.getElementById("modal-description-input").value;

        if (transaction.category !== document.getElementById("modal-category-input").value) {
          countMapDec(allCategories, transaction.category);
          transaction.category = document.getElementById("modal-category-input").value;
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
          <span>${transaction.amount} ₽</span>
          <div style="text-align: end; color: ${RATES.get(transaction.rate)[1]}">{x}</div>
        </div>
      `;
    list.appendChild(li);

    balance += transaction.amount;
  });

  balanceElement.textContent = balance;
  updateCharts(transactions);
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

// --- Charts ---
function updateCharts(transactions) {
  // Удаляем старые графики
  const chartId = "pieChart";
  const existingChart = Chart.getChart(chartId);
  if (existingChart) {
    existingChart.destroy();
  }

  // Группировка по категориям
  const categories = {};
  transactions.forEach((t) => {
    if (!categories[t.category]) categories[t.category] = 0;
    categories[t.category] += t.amount;
  });

  // Круговой график
  new Chart(document.getElementById("pieChart"), {
    type: "pie",
    data: {
      labels: Object.keys(categories),
      datasets: [
        {
          data: Object.values(categories),
          // backgroundColor: generateRandomColors(Object.getOwnPropertyNames(categories).length)
        },
      ],
    },
  });

  // Столбчатый график
  // new Chart(document.getElementById("barChart"), {
  //     type: "bar",
  //     data: {
  //       labels: Object.keys(categories),
  //       datasets: [{
  //         label: "Сумма по категориям",
  //         data: Object.values(categories),
  //         backgroundColor: "#4CAF50"
  //       }]
  //     },
  //     options: {
  //       scales: {
  //         y: {
  //           beginAtZero: true
  //         }
  //       }
  //     }
  //   }
  // );
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

  suggestedTag = suggestAutocomplete(allTags, value);

  if (value.endsWith("   ")) {
    document.getElementById("add-tag").click();
  }

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
  readOnlyTransaction([loadAllCategories, loadAllTags]);
});

// --- api with DOM ---
function renderTags() {
  const container = document.getElementById("tags-container");
  container.innerHTML = tags
    .map((tag) => `<span class="tag">${tag} <button onclick="removeTag('${tag}')">×</button></span>`)
    .join("");
}

// --- api ---
function suggestAutocomplete(sourceMap, inputText) {
  let unionCount = 0;
  let weight = 0;
  let suggestion = null;

  inputText = inputText.trim().toLowerCase();
  sourceMap.forEach((v, k) => {
    const lower = k.toLowerCase();
    const count = unionStart(inputText, lower);
    if (count > unionCount || (count === unionCount && v > weight)) {
      suggestion = k;
      weight = v;
      unionCount = count;
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
  if (value) {
    tags.push(value);
    renderTags();
    tagInput.value = "";
  }
});

// --- Pages and nav ---
function showPage(pageId) {
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

showPage("home");

// Получаем элементы DOM
const modal = document.getElementById("modal");
const closeBtn = document.querySelector(".close-btn");

// Функция открытия модального окна
function openModal(title, contentHTML) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = contentHTML;
  modal.classList.add("show");
  document.body.style.overflow = "hidden"; // Блокируем прокрутку страницы
}

// Функция закрытия
function closeModal() {
  modal.classList.remove("show");
  document.body.style.overflow = "auto"; // Восстанавливаем прокрутку
}

// Закрытие по клику на крестик
closeBtn.addEventListener("click", closeModal);

// Закрытие по клику вне окна
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
