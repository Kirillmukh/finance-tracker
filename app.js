let db;
let allCategories;
let allTags;
let tags = [];
let suggestedCategory = "";
let suggestedTag = "";

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

// --- One Per Request ---
function loadTransactions(transactions) {
  const list = document.getElementById("transactions");
  const balanceElement = document.getElementById("balance");

  list.innerHTML = "";
  let balance = 0;

  transactions.forEach((transaction) => {
    const li = document.createElement("li");
    li.className = transaction.type;
    li.innerHTML = `
        <div>
          <strong>${transaction.description}</strong>
          <div>${transaction.category} • ${transaction.tags.join(", ")}</div>
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
    allCategories = new Map(
      Object.entries(JSON.parse(localStorage.categories))
    );
    return;
  }

  allCategories = new Map();
  transactions.forEach((t) => {
    countMapAdd(allCategories, t.category);
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
      countMapAdd(allTags, t);
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

  countMapAdd(allCategories, transaction.category);
  saveCategories();
  tags
    .flat((tags) => tags)
    .forEach((tag) => {
      countMapAdd(allTags, tag);
    });
  saveTags();
  tx.oncomplete = () => {
    readOnlyTransaction([loadTransactions]);
    e.target.reset();
    tags = [];
    renderTags();
  };
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

function countMapAdd(map, object) {
  if (!map.has(object)) {
    map.set(object, 0);
  }
  map.set(object, map.get(object) + 1);
}

function generateRandomColors(n) {
    const colors = [];
    for (let i = 0; i < n; i++) {
      const color =
        "#" +
        Math.floor(Math.random() * 0xffffff)
          .toString(16)
          .padStart(6, "0");
      colors.push(color);
    }
    return colors;
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
categorySuggestionDiv.addEventListener("click", (event) =>
  applySuggestion(categoryInput, categorySuggestionDiv, suggestedCategory)
);

const tagInput = document.getElementById("tag-input");
const tagSuggestionDiv = document.getElementById("tag-suggestion");
tagSuggestionDiv.addEventListener("click", (event) =>
  applySuggestion(tagInput, tagSuggestionDiv, suggestedTag)
);

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

// --- api with DOM ---
function renderTags() {
  const container = document.getElementById("tags-container");
  container.innerHTML = tags
    .map(
      (tag) =>
        `<span class="tag">${tag} <button onclick="removeTag('${tag}')">×</button></span>`
    )
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
// Показываем только активную страницу
function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.style.display = "none";
  });
  document.getElementById(`${pageId}-page`).style.display = "block";

  // Обновляем активный элемент в навбаре
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });
  document
    .querySelector(`.nav-item[data-page="${pageId}"]`)
    .classList.add("active");
}

// Обработчики кликов для навбара
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const pageId = item.getAttribute("data-page");
    showPage(pageId);
  });
});

// Инициализация: показываем главную страницу
// showPage("home");
