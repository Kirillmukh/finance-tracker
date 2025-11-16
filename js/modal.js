// Modal module - handles modal window operations
import { capitalize } from './utils.js';

export class Modal {
  constructor() {
    this.modal = document.getElementById("modal");
    this.closeBtn = document.querySelector(".close-btn");
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.closeBtn.addEventListener("click", () => this.close());

    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open(title, contentHTML) {
    document.getElementById("modal-title").textContent = capitalize(title);
    document.getElementById("modal-body").innerHTML = contentHTML;
    this.modal.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  close() {
    this.modal.classList.remove("show");
    document.body.style.overflow = "auto";
  }
}