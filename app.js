let db;
let allCategories;
let allTags;
let tags = [];

// Инициализация IndexedDB
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

function renderTags() {
  const container = document.getElementById("tags-container");
  container.innerHTML = tags
    .map(
      (tag) =>
        `<span class="tag">${tag} <button onclick="removeTag('${tag}')">×</button></span>`
    )
    .join("");
}

window.removeTag = (tag) => {
  tags = tags.filter((t) => t !== tag);
  renderTags();
};

const inputTag = document.getElementById("tag-input");

// Добавление транзакции
document.getElementById("transaction-form").addEventListener("submit", (e) => {
  if (inputTag.value.trim()) {
    document.getElementById("add-tag").dispatchEvent(new Event("click"));
  }

  e.preventDefault();

  const transaction = {
    description: document.getElementById("description").value,
    amount: +document.getElementById("amount").value,
    category: document.getElementById("category").value,
    tags: [...tags],
    date: new Date().toLocaleDateString(),
  };

  const tx = db.transaction("transactions", "readwrite");
  const store = tx.objectStore("transactions");
  store.add(transaction);

  if (!allCategories.has(transaction.category)) {
    allCategories.set(transaction.category, 0);
  }
  allCategories.set(
    transaction.category,
    allCategories.get(transaction.category) + 1
  );
  saveCategories();
  tags
    .flat((tags) => tags)
    .forEach((tag) => {
      if (!allTags.has(tag)) {
        allTags.set(tag, 0);
      }
      allTags.set(tag, allTags.get(tag) + 1);
    });
  saveTags();
  tx.oncomplete = () => {
    readOnlyTransaction([loadTransactions]);
    e.target.reset();
    tags = [];
    renderTags();
  };
});

// Загрузка транзакций и обновление UI
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

// Обновление графиков
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

function loadAllTags(transactions) {
  if (localStorage.tags) {
    allTags = new Map(Object.entries(JSON.parse(localStorage.tags)));
    return;
  }

  allTags = new Map();
  transactions
    .flatMap((t) => t.tags)
    .forEach((t) => {
      if (!allTags.has(t)) {
        allTags.set(t, 0);
      }
      allTags.set(t, allTags.get(t) + 1);
    });

  saveTags();
}

function saveTags() {
  localStorage.tags = JSON.stringify(Object.fromEntries(allTags));
}

document.getElementById("add-tag").addEventListener("click", () => {
  const tagInput = document.getElementById("tag-input");
  const tag = tagInput.value.trim();

  if (tag) {
    tags.push(tag);
    renderTags();
    tagInput.value = "";
  }
});

function loadAllCategories(transactions) {
  if (localStorage.categories) {
    allCategories = new Map(
      Object.entries(JSON.parse(localStorage.categories))
    );
    return;
  }

  allCategories = new Map();
  transactions.forEach((t) => {
    if (!allCategories.has(t.category)) {
      allCategories.set(t.category, 0);
    }
    allCategories.set(t.category, allCategories.get(t.category) + 1);
  });

  saveCategories();
}

function saveCategories() {
  localStorage.categories = JSON.stringify(Object.fromEntries(allCategories));
}

function unionStart(source, target) {
  if (source.length > target.length || source.length == 0) {
    return -1;
  }
  let i = 0;
  while (i < source.length && i < target.length) {
    if (source[i] !== target[i]) {
      return -1;
    }
    i++;
  }
  return i;
}

function suggestCategory(input) {
  let unionCount = 0;
  let weight = 0;
  let suggestion = null;

  input = input.trim().toLowerCase();
  allCategories.forEach((v, k) => {
    const categoryLower = k.toLowerCase();
    const count = unionStart(input, categoryLower);
    if (count > unionCount || (count === unionCount && v > weight)) {
      suggestion = k;
      weight = v;
      unionCount = count;
    }
  });

  return suggestion;
}

const inputCategory = document.getElementById("category");
const suggestion = document.getElementById("suggestion");

let suggestedCategory = "";

const applySuggestion = () => {
  inputCategory.value = suggestedCategory;
  suggestion.style.display = "none";
};

inputCategory.addEventListener("input", (event) => {
  const value = event.target.value;

  suggestedCategory = suggestCategory(value);

  if (!suggestedCategory) {
    suggestion.style.display = "none";
    return;
  }

  suggestion.textContent = suggestedCategory;
  suggestion.style.display = "block";

  if (value.endsWith(" ")) {
    applySuggestion();
  }
});

suggestion.addEventListener("click", applySuggestion);

function suggestTag(input) {
  let unionCount = 0;
  let weight = 0;
  let suggestion = null;

  input = input.trim().toLowerCase();
  allTags.forEach((v, k) => {
    let tagLower = k.toLowerCase();
    const count = unionStart(input, tagLower);
    if (count > unionCount || (count === unionCount && v > weight)) {
      suggestion = tagLower;
      weight = v;
      unionCount = count;
    }
  });

  return suggestion;
}

const tagSuggestion = document.getElementById("tag-suggestion");

let suggestedTag = "";

const applyTagSuggestion = function () {
  inputTag.value = suggestedTag;
  tagSuggestion.style.display = "none";
};

inputTag.addEventListener("input", (event) => {
  const value = event.target.value;

  suggestedTag = suggestTag(value);

  if (!suggestedTag) {
    tagSuggestion.style.display = "none";
    return;
  }

  tagSuggestion.textContent = suggestedTag;
  tagSuggestion.style.display = "block";

  if (value.endsWith(" ")) {
    applyTagSuggestion();
  }
});

tagSuggestion.addEventListener("click", applyTagSuggestion);
