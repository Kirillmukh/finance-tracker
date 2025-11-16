// UI module - handles UI rendering and DOM manipulation
import { RATES, formatDate } from './utils.js';
import { suggestAutocomplete, applySuggestion } from './autocomplete.js';

export class UI {
  constructor(modal) {
    this.modal = modal;
    this.tags = [];
    this.tagsToRemove = new Set();
    this.suggestedCategory = "";
    this.suggestedTag = "";
  }

  renderTags() {
    const container = document.getElementById("tags-container");
    container.innerHTML = this.tags
      .map((tag) => `<span class="tag">${tag} <button class="remove-tag-btn" onclick="window.removeTag('${tag}')">×</button></span>`)
      .join("");
  }

  removeTag(tag) {
    this.tags = this.tags.filter((t) => t !== tag);
    this.renderTags();
  }

  setupTagInput(allTags) {
    const tagInput = document.getElementById("tag-input");
    const tagSuggestionDiv = document.getElementById("tag-suggestion");
    
    tagSuggestionDiv.addEventListener("click", () => 
      applySuggestion(tagInput, tagSuggestionDiv, this.suggestedTag)
    );

    tagInput.addEventListener("input", (event) => {
      const value = event.target.value;

      if (value.endsWith("   ")) {
        document.getElementById("add-tag").click();
      }

      this.suggestedTag = suggestAutocomplete(allTags, value);

      if (!this.suggestedTag) {
        tagSuggestionDiv.style.display = "none";
        return;
      }

      tagSuggestionDiv.textContent = this.suggestedTag;
      tagSuggestionDiv.style.display = "block";

      if (value.endsWith("  ")) {
        applySuggestion(tagInput, tagSuggestionDiv, this.suggestedTag);
      }
    });

    document.getElementById("add-tag").addEventListener("click", () => {
      const value = tagInput.value.trim();
      if (!value || this.tags.includes(value)) {
        tagInput.value = "";
        return;
      }
      this.tags.push(value);
      this.renderTags();
      tagInput.value = "";
    });
  }

  setupCategoryInput(allCategories) {
    const categoryInput = document.getElementById("category-input");
    const categorySuggestionDiv = document.getElementById("category-suggestion");
    
    categorySuggestionDiv.addEventListener("click", () =>
      applySuggestion(categoryInput, categorySuggestionDiv, this.suggestedCategory)
    );

    categoryInput.addEventListener("input", (event) => {
      const value = event.target.value;

      this.suggestedCategory = suggestAutocomplete(allCategories, value);

      if (!this.suggestedCategory) {
        categorySuggestionDiv.style.display = "none";
        return;
      }

      categorySuggestionDiv.textContent = this.suggestedCategory;
      categorySuggestionDiv.style.display = "block";

      if (value.endsWith("  ")) {
        applySuggestion(categoryInput, categorySuggestionDiv, this.suggestedCategory);
      }
    });
  }

  setupModalAutocomplete(allCategories, allTags, transaction) {
    const modalCategoryInput = document.getElementById("modal-category-input");
    const modalCategorySuggestionDiv = document.getElementById("modal-category-suggestion");
    
    modalCategorySuggestionDiv.addEventListener("click", () =>
      applySuggestion(modalCategoryInput, modalCategorySuggestionDiv, this.suggestedCategory)
    );
    
    modalCategoryInput.addEventListener("input", (event) => {
      const value = event.target.value;

      this.suggestedCategory = suggestAutocomplete(allCategories, value);

      if (!this.suggestedCategory) {
        modalCategorySuggestionDiv.style.display = "none";
        return;
      }

      modalCategorySuggestionDiv.textContent = this.suggestedCategory;
      modalCategorySuggestionDiv.style.display = "block";

      if (value.endsWith("  ")) {
        applySuggestion(modalCategoryInput, modalCategorySuggestionDiv, this.suggestedCategory);
      }
    });

    const modalTagInput = document.getElementById("modal-tag-input");
    const modalTagSuggestionDiv = document.getElementById("modal-tag-suggestion");
    
    modalTagSuggestionDiv.addEventListener("click", () =>
      applySuggestion(modalTagInput, modalTagSuggestionDiv, this.suggestedTag)
    );
    
    modalTagInput.addEventListener("input", (event) => {
      const value = event.target.value;
      if (value.endsWith("   ")) {
        document.getElementById("modal-add-tag").click();
      }

      this.suggestedTag = suggestAutocomplete(allTags, value, [...transaction.tags, ...this.tags]);
      if (!this.suggestedTag) {
        modalTagSuggestionDiv.style.display = "none";
        return;
      }

      modalTagSuggestionDiv.textContent = this.suggestedTag;
      modalTagSuggestionDiv.style.display = "block";

      if (value.endsWith("  ")) {
        applySuggestion(modalTagInput, modalTagSuggestionDiv, this.suggestedTag);
      }
    });
  }

  createTransactionModalContent(transaction) {
    return `
      <div>
        <strong>Описание</strong> <input id="modal-description-input" value = "${transaction.description}"><br>
        <strong>Сумма</strong> <span><input type="number" id="modal-amount-input" value="${transaction.amount}"> ₽</span><br>
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
                `<span class="tag">${tag} <button class="remove-tag-btn" onclick="window.modalRemoveTag('${tag}')">×</button></span>`
            )
            .join("")}
          </div>
        <div>
        <strong>Дата</strong> <input type="date" id="modal-date-input"><br>
        <strong>Время</strong> <input type="time" id="modal-time-input">
      </div>
      <div class="column">
        <button id="modal-save-btn">Сохранить изменения</button>
        <button id="modal-delete-btn">Удалить</button>
        <button id="modal-duplicate-btn">Дублировать</button>
      </div>
    `;
  }

  setupModalTagHandling(transaction) {
    const modalTagInput = document.getElementById("modal-tag-input");
    
    document.getElementById("modal-add-tag").addEventListener("click", () => {
      const value = modalTagInput.value.trim();
      
      // If tag is marked for removal, allow re-adding it
      if (this.tagsToRemove.has(value)) {
        this.tagsToRemove.delete(value);
        modalTagInput.value = "";
        return;
      }
      
      if (!value || transaction.tags.includes(value) || this.tags.includes(value)) {
        modalTagInput.value = "";
        return;
      }
      this.tags.push(value);

      document
        .getElementById("modal-tags-list")
        .insertAdjacentHTML(
          "beforeend",
          `<span class="tag">${value} <button class="remove-tag-btn" onclick="window.modalRemoveTag('${value}')">×</button></span>`
        );
      modalTagInput.value = "";
    });
  }

  modalRemoveTag(tag) {
    this.tagsToRemove.add(tag);
  }

  clearTags() {
    this.tags.splice(0, this.tags.length);
  }

  clearTagsToRemove() {
    this.tagsToRemove.clear();
  }

  getTags() {
    return this.tags;
  }

  getTagsToRemove() {
    return this.tagsToRemove;
  }
}