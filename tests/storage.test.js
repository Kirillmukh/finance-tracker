import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Storage } from '../js/storage.js'

// jsdom localStorage не поддерживает прямое присваивание свойств (localStorage.foo = ...)
// Заменяем на простой мок с поддержкой direct property access
function createLocalStorageMock() {
  const store = {}
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'removeItem') return (k) => { delete target[k] }
      return Object.prototype.hasOwnProperty.call(target, prop) ? target[prop] : undefined
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
    deleteProperty(target, prop) {
      delete target[prop]
      return true
    },
  })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

describe('Storage — категории', () => {
  it('saveCategories/loadCategories: сохраняет и загружает Map', () => {
    const map = new Map([['Food', 3], ['Transport', 1]])
    Storage.saveCategories(map)
    const loaded = Storage.loadCategories()
    expect(loaded).toBeInstanceOf(Map)
    expect(loaded.get('Food')).toBe(3)
    expect(loaded.get('Transport')).toBe(1)
  })

  it('loadCategories возвращает null если нет сохранённых данных', () => {
    expect(Storage.loadCategories()).toBeNull()
  })

  it('clearCategories удаляет данные категорий', () => {
    Storage.saveCategories(new Map([['Food', 1]]))
    Storage.clearCategories()
    expect(Storage.loadCategories()).toBeNull()
  })
})

describe('Storage — теги', () => {
  it('saveTags/loadTags: сохраняет и загружает Map', () => {
    const map = new Map([['lunch', 5], ['cafe', 2]])
    Storage.saveTags(map)
    const loaded = Storage.loadTags()
    expect(loaded).toBeInstanceOf(Map)
    expect(loaded.get('lunch')).toBe(5)
    expect(loaded.get('cafe')).toBe(2)
  })

  it('loadTags возвращает null если нет сохранённых данных', () => {
    expect(Storage.loadTags()).toBeNull()
  })

  it('clearTags удаляет данные тегов', () => {
    Storage.saveTags(new Map([['lunch', 1]]))
    Storage.clearTags()
    expect(Storage.loadTags()).toBeNull()
  })
})

describe('Storage — лимит транзакций', () => {
  it('getLimit возвращает "all" по умолчанию', () => {
    expect(Storage.getLimit()).toBe('all')
  })

  it('setLimit/getLimit: сохраняет и возвращает значение', () => {
    Storage.setLimit('week')
    expect(Storage.getLimit()).toBe('week')
  })

  it('поддерживает все допустимые значения лимита', () => {
    for (const val of ['all', 'day', 'week', 'month', 'year', 'custom']) {
      Storage.setLimit(val)
      expect(Storage.getLimit()).toBe(val)
    }
  })
})

describe('Storage — цель графика', () => {
  it('getChartTarget возвращает "category" по умолчанию', () => {
    expect(Storage.getChartTarget()).toBe('category')
  })

  it('setChartTarget/getChartTarget: сохраняет и возвращает значение', () => {
    Storage.setChartTarget('rate')
    expect(Storage.getChartTarget()).toBe('rate')
  })

  it('поддерживает все допустимые значения цели', () => {
    for (const val of ['category', 'rate', 'tags']) {
      Storage.setChartTarget(val)
      expect(Storage.getChartTarget()).toBe(val)
    }
  })
})

describe('Storage — текущая страница', () => {
  it('getPage возвращает "home" по умолчанию', () => {
    expect(Storage.getPage()).toBe('home')
  })

  it('setPage/getPage: сохраняет и возвращает значение', () => {
    Storage.setPage('input')
    expect(Storage.getPage()).toBe('input')
  })
})
