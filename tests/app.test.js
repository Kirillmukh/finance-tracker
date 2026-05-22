import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

let mockTransactionManager

vi.mock('../js/db.js', () => ({
  Database: vi.fn(() => ({ init: vi.fn(() => Promise.resolve()) }))
}))

vi.mock('../js/ui.js', () => ({
  UI: vi.fn(() => ({
    setupCategoryInput: vi.fn(),
    setupTagInput: vi.fn(),
    initDefaultTag: vi.fn(),
    clearTags: vi.fn(),
    clearTagsToRemove: vi.fn(),
    getTags: vi.fn(() => []),
    getTagsToRemove: vi.fn(() => new Set()),
    removeTag: vi.fn(),
    modalRemoveTag: vi.fn(),
  }))
}))

vi.mock('../js/modal.js', () => ({
  Modal: vi.fn(() => ({ open: vi.fn(), close: vi.fn() }))
}))

vi.mock('../js/navigation.js', () => ({
  Navigation: vi.fn(() => ({ init: vi.fn(), showPage: vi.fn() }))
}))

vi.mock('../js/transactions.js', () => ({
  TransactionManager: vi.fn().mockImplementation(() => {
    mockTransactionManager = {
      init: vi.fn(() => Promise.resolve()),
      getAllCategories: vi.fn(() => new Map()),
      getAllTags: vi.fn(() => new Map()),
      setupTransactionForm: vi.fn(),
      setupLimitSelect: vi.fn(),
      setupChartTargetSelect: vi.fn(),
      singleLoadTransactionsRender: vi.fn(),
      limit: 'all',
    }
    return mockTransactionManager
  })
}))

vi.mock('../js/import-export.js', () => ({
  ImportExport: vi.fn(() => ({}))
}))

vi.mock('../js/storage.js', () => ({
  Storage: {
    getDefaultRate: vi.fn(() => ''),
    getDefaultTag: vi.fn(() => ''),
    getPage: vi.fn(() => 'home'),
    getTheme: vi.fn(() => 'system'),
    getLimit: vi.fn(() => 'all'),
    setDefaultTag: vi.fn(),
    setLimit: vi.fn(),
    setDefaultRate: vi.fn(),
    setTheme: vi.fn(),
  }
}))

vi.mock('../js/rename-tag.js', () => ({
  setupRenameTagUI: vi.fn()
}))

vi.mock('../js/demo.js', () => ({
  Demo: vi.fn(() => ({ isDemo: vi.fn(() => false) })),
  setupDemoUI: vi.fn()
}))

import { Storage } from '../js/storage.js'

function setupDOM() {
  document.body.innerHTML = `
    <select id="default-rate-select">
      <option value="">—</option>
      <option value="ok">Ок</option>
    </select>
    <input id="rate-select" />
    <button class="nav-item" data-page="input">Input</button>
    <select id="theme-select">
      <option value="system">Системная</option>
    </select>
    <input id="default-tag-input" />
    <button id="default-tag-save-btn">Сохранить</button>
    <p id="default-tag-status" style="display:none"></p>
    <select id="transactions-limit">
      <option value="all">Все</option>
      <option value="day">День</option>
      <option value="week">Неделя</option>
      <option value="month">Месяц</option>
      <option value="year">Год</option>
      <option value="custom">Произвольный</option>
    </select>
    <button id="legend-toggle"></button>
    <div id="chart-legend"></div>
  `
}

describe('app.js — кнопка сохранения тега по умолчанию обновляет #transactions-limit', () => {
  beforeAll(async () => {
    setupDOM()
    await import('../app.js')
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  beforeEach(() => {
    const select = document.getElementById('transactions-limit')
    select.querySelector('option[value="default-tag"]')?.remove()
    select.value = 'all'
    document.getElementById('default-tag-input').value = ''
    vi.clearAllMocks()
  })

  it('добавляет опцию "default-tag" в select при сохранении нового тега', () => {
    document.getElementById('default-tag-input').value = 'обед'
    document.getElementById('default-tag-save-btn').click()

    const option = document.getElementById('transactions-limit').querySelector('option[value="default-tag"]')
    expect(option).not.toBeNull()
    expect(option.textContent).toBe('обед')
  })

  it('вставляет опцию "default-tag" перед опцией "custom"', () => {
    document.getElementById('default-tag-input').value = 'кафе'
    document.getElementById('default-tag-save-btn').click()

    const values = [...document.getElementById('transactions-limit').options].map(o => o.value)
    expect(values.indexOf('default-tag')).toBeLessThan(values.indexOf('custom'))
  })

  it('заменяет существующую опцию при повторном сохранении с другим тегом', () => {
    const input = document.getElementById('default-tag-input')
    const btn = document.getElementById('default-tag-save-btn')

    input.value = 'обед'
    btn.click()
    input.value = 'ужин'
    btn.click()

    const select = document.getElementById('transactions-limit')
    const options = select.querySelectorAll('option[value="default-tag"]')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toBe('ужин')
  })

  it('удаляет опцию "default-tag" при очистке тега', () => {
    const input = document.getElementById('default-tag-input')
    const btn = document.getElementById('default-tag-save-btn')

    input.value = 'обед'
    btn.click()
    input.value = ''
    btn.click()

    expect(document.getElementById('transactions-limit').querySelector('option[value="default-tag"]')).toBeNull()
  })

  it('сбрасывает select на "all" и вызывает singleLoadTransactionsRender, если "default-tag" был выбран при удалении', () => {
    const input = document.getElementById('default-tag-input')
    const btn = document.getElementById('default-tag-save-btn')
    const select = document.getElementById('transactions-limit')

    input.value = 'обед'
    btn.click()
    select.value = 'default-tag'

    input.value = ''
    btn.click()

    expect(select.value).toBe('all')
    expect(Storage.setLimit).toHaveBeenCalledWith('all')
    expect(mockTransactionManager.singleLoadTransactionsRender).toHaveBeenCalled()
  })

  it('не вызывает singleLoadTransactionsRender при удалении тега, если "default-tag" не был выбран', () => {
    const input = document.getElementById('default-tag-input')
    const btn = document.getElementById('default-tag-save-btn')

    input.value = 'обед'
    btn.click()
    // select remains on 'all'

    input.value = ''
    btn.click()

    expect(mockTransactionManager.singleLoadTransactionsRender).not.toHaveBeenCalled()
  })
})

describe('app.js — #default-tag-status отображение', () => {
  beforeAll(async () => {
    setupDOM()
    vi.resetModules()
    await import('../app.js')
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  beforeEach(() => {
    const select = document.getElementById('transactions-limit')
    select.querySelector('option[value="default-tag"]')?.remove()
    select.value = 'all'
    document.getElementById('default-tag-input').value = ''
    vi.clearAllMocks()
  })

  it('скрыт по умолчанию', () => {
    const status = document.getElementById('default-tag-status')
    expect(status.style.display).toBe('none')
  })

  it('становится видимым после сохранения тега', () => {
    vi.useFakeTimers()
    document.getElementById('default-tag-input').value = 'обед'
    document.getElementById('default-tag-save-btn').click()

    const status = document.getElementById('default-tag-status')
    expect(status.style.display).toBe('block')
    expect(status.textContent).toBe('Тег "обед" сохранён')
    vi.useRealTimers()
  })

  it('скрывается снова через 2 секунды', () => {
    vi.useFakeTimers()
    document.getElementById('default-tag-input').value = 'обед'
    document.getElementById('default-tag-save-btn').click()

    vi.advanceTimersByTime(2000)

    const status = document.getElementById('default-tag-status')
    expect(status.style.display).toBe('none')
    expect(status.textContent).toBe('')
    vi.useRealTimers()
  })

  it('становится видимым при удалении тега', () => {
    vi.useFakeTimers()
    document.getElementById('default-tag-input').value = 'обед'
    document.getElementById('default-tag-save-btn').click()
    vi.advanceTimersByTime(2000)

    document.getElementById('default-tag-input').value = ''
    document.getElementById('default-tag-save-btn').click()

    const status = document.getElementById('default-tag-status')
    expect(status.style.display).toBe('block')
    expect(status.textContent).toBe('Тег по умолчанию удалён')
    vi.useRealTimers()
  })
})
