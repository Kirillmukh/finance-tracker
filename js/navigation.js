// Navigation module - handles page navigation
import { Storage } from './storage.js';

export class Navigation {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const pageId = item.getAttribute("data-page");
        this.showPage(pageId);
      });
    });
  }

  showPage(pageId) {
    Storage.setPage(pageId);
    document.querySelectorAll(".page").forEach((page) => {
      page.style.display = "none";
    });
    document.getElementById(`${pageId}-page`).style.display = "block";

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
    });
    document.querySelector(`.nav-item[data-page="${pageId}"]`).classList.add("active");
  }

  init() {
    this.showPage(Storage.getPage());
  }
}