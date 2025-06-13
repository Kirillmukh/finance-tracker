let db;
let allCategories;
let allTags;
let tags = [];
let suggestedCategory = "";
let suggestedTag = "";
let tagsToRemove = new Set();

// --- db ---
const request = indexedDB.open("FinanceTrackerDB", 2);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains("transactions")) {
    db.createObjectStore("transactions", {
      keyPath: "id",
      autoIncrement: true,
    });
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  readOnlyTransaction([loadTransactions, loadAllCategories, loadAllTags]);
};

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
          <strong>Описание</strong>: <input id="modal-description-input" value = "${transaction.description}"><br>
          <strong>Категория</strong>: <input id="modal-category-input" value="${transaction.category}">
          <div><strong>Теги</strong><br>
            <div id="modal-tags-list">${transaction.tags
              .map(
                (tag) =>
                  `<span class="tag">${tag} <button onclick="tagsToRemove.add('${tag}'); this.parentElement.remove()">×</button></span>`
              )
              .join("")}
            </div>
            <input id="modal-tag-input" placeholder="Добавить тэг?" />
            <button id="modal-add-tag">+</button>
          <div>
          <strong>Сумма</strong>: <span><input type="number" id="modal-amount-input" value="${
            transaction.amount
          }"> ₽</span>
        </div>
        <button id="modal-save-btn">Сохранить изменения</button>
        <button id="modal-delete-btn">Удалить</button>
        <button id="modal-duplicate-btn">Дублировать</button>
        `
      );
      tagsToRemove.clear();

      document.getElementById("modal-add-tag").addEventListener("click", () => {
        const inputTag = document.getElementById("modal-tag-input");
        if (!inputTag.value || transaction.tags.includes(inputTag.value)) {
          inputTag.value = '';
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

        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");

        store.put(transaction);

        tx.oncomplete = () => {
          readOnlyTransaction([loadTransactions]);
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
          readOnlyTransaction([loadTransactions]);
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
        toAdd.date = new Date();
        countMapInc(allCategories, toAdd.category);
        saveCategories();
        toAdd.tags.forEach(tag => {
          countMapInc(allTags, tag);
        });
        saveTags();
        store.add(toAdd);

        tx.oncomplete = () => {
          readOnlyTransaction([loadTransactions]);
        };
        tags.splice(0, tags.length);
        tagsToRemove.clear();
        closeModal();
      });
    };
    li.innerHTML = `
        <div>
          <strong>${transaction.description}</strong>
          <div>${transaction.category} ${transaction.tags.length !== 0 ? '•' : ''} ${transaction.tags.join(", ")}</div>
        </div>
        <span>${transaction.amount} ₽</span>
      `;
    list.appendChild(li);

    balance += transaction.amount;
  });

  balanceElement.textContent = balance;
  updateCharts(transactions);
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
    tags: [...tags],
    date: new Date().toLocaleDateString(),
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
    readOnlyTransaction([loadTransactions]);
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
  if (inputText.length > src.length || inputText.length == 0) {
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

function formatDate(date) {
  let dd = date.getDate();
  if (dd < 10) dd = "0" + dd;
  let mm = date.getMonth() + 1;
  if (mm < 10) mm = "0" + mm;
  const yy = date.getFullYear();
  return dd + "." + mm + "." + yy;
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
          readOnlyTransaction([loadTransactions]);
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
