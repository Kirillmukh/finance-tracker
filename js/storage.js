// Storage module - handles localStorage operations
export class Storage {
  static saveCategories(allCategories) {
    localStorage.categories = JSON.stringify(Object.fromEntries(allCategories));
  }

  static loadCategories() {
    if (localStorage.categories) {
      return new Map(Object.entries(JSON.parse(localStorage.categories)));
    }
    return null;
  }

  static saveTags(allTags) {
    localStorage.tags = JSON.stringify(Object.fromEntries(allTags));
  }

  static loadTags() {
    if (localStorage.tags) {
      return new Map(Object.entries(JSON.parse(localStorage.tags)));
    }
    return null;
  }

  static getLimit() {
    return localStorage.limit ? localStorage.limit : "all";
  }

  static setLimit(limit) {
    localStorage.limit = limit;
  }

  static getChartTarget() {
    return localStorage.chartTarget ? localStorage.chartTarget : "category";
  }

  static setChartTarget(chartTarget) {
    localStorage.chartTarget = chartTarget;
  }

  static getPage() {
    return localStorage.page ? localStorage.page : "home";
  }

  static setPage(page) {
    localStorage.page = page;
  }

  static clearCategories() {
    delete localStorage.categories;
  }

  static clearTags() {
    delete localStorage.tags;
  }

  static getDefaultTag() {
    return localStorage.defaultTag || "";
  }

  static setDefaultTag(tag) {
    if (tag) {
      localStorage.defaultTag = tag;
    } else {
      delete localStorage.defaultTag;
    }
  }

  static getDemoMode() {
    return localStorage.demoMode === "true";
  }

  static setDemoMode(value) {
    if (value) {
      localStorage.demoMode = "true";
    } else {
      delete localStorage.demoMode;
    }
  }
}