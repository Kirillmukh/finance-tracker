import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../js/storage.js', () => ({
  Storage: {
    loadCategories: vi.fn(() => null),
    loadTags: vi.fn(() => null),
    saveCategories: vi.fn(),
    saveTags: vi.fn(),
    getLimit: vi.fn(() => 'all'),
    getChartTarget: vi.fn(() => 'category'),
    setLimit: vi.fn(),
    setChartTarget: vi.fn(),
    getDefaultTag: vi.fn(() => ''),
  },
}))

vi.mock('../js/chart.js', () => ({
  setLegendClickCallback: vi.fn(),
  getHiddenCategories: vi.fn(() => new Set()),
  clearHiddenCategories: vi.fn(),
  updateCharts: vi.fn(),
  updateChartForRates: vi.fn(),
  updateChartForTags: vi.fn(),
}))

import { TransactionManager } from '../js/transactions.js'
import { UI } from '../js/ui.js'
import { Storage } from '../js/storage.js'
import { getHiddenCategories } from '../js/chart.js'

const sampleTransactions = [
  { id: 1, description: 'A', amount: 100, category: 'Food', rate: 'ok', tags: ['lunch', 'cafe'], date: 1000 },
  { id: 2, description: 'B', amount: 200, category: 'Food', rate: 'waste', tags: ['dinner'], date: 2000 },
  { id: 3, description: 'C', amount: 50, category: 'Transport', rate: 'ok', tags: [], date: 3000 },
]

function makeManager() {
  const db = { init: vi.fn(() => Promise.resolve()) }
  const ui = { clearTags: vi.fn(), clearTagsToRemove: vi.fn(), getTags: vi.fn(() => []), getTagsToRemove: vi.fn(() => new Set()) }
  const modal = { open: vi.fn(), close: vi.fn() }
  const navigation = { showPage: vi.fn() }
  return new TransactionManager(db, ui, modal, navigation)
}

beforeEach(() => {
  vi.clearAllMocks()
  Storage.loadCategories.mockReturnValue(null)
  Storage.loadTags.mockReturnValue(null)
  getHiddenCategories.mockReturnValue(new Set())
})

describe('TransactionManager.loadAllCategories', () => {
  it('строит Map категорий из транзакций', () => {
    const mgr = makeManager()
    mgr.loadAllCategories(sampleTransactions)
    expect(mgr.allCategories.get('Food')).toBe(2)
    expect(mgr.allCategories.get('Transport')).toBe(1)
  })

  it('сохраняет категории в Storage', () => {
    const mgr = makeManager()
    mgr.loadAllCategories(sampleTransactions)
    expect(Storage.saveCategories).toHaveBeenCalledWith(mgr.allCategories)
  })

  it('использует сохранённые категории если они есть', () => {
    const stored = new Map([['Food', 99]])
    Storage.loadCategories.mockReturnValue(stored)
    const mgr = makeManager()
    mgr.loadAllCategories(sampleTransactions)
    expect(mgr.allCategories).toBe(stored)
    expect(Storage.saveCategories).not.toHaveBeenCalled()
  })
})

describe('TransactionManager.loadAllTags', () => {
  it('строит Map тегов из транзакций', () => {
    const mgr = makeManager()
    mgr.loadAllTags(sampleTransactions)
    expect(mgr.allTags.get('lunch')).toBe(1)
    expect(mgr.allTags.get('cafe')).toBe(1)
    expect(mgr.allTags.get('dinner')).toBe(1)
  })

  it('не включает пустые теги', () => {
    const mgr = makeManager()
    mgr.loadAllTags(sampleTransactions)
    expect(mgr.allTags.has(undefined)).toBe(false)
    expect(mgr.allTags.has('')).toBe(false)
  })

  it('сохраняет теги в Storage', () => {
    const mgr = makeManager()
    mgr.loadAllTags(sampleTransactions)
    expect(Storage.saveTags).toHaveBeenCalledWith(mgr.allTags)
  })

  it('использует сохранённые теги если они есть', () => {
    const stored = new Map([['lunch', 88]])
    Storage.loadTags.mockReturnValue(stored)
    const mgr = makeManager()
    mgr.loadAllTags(sampleTransactions)
    expect(mgr.allTags).toBe(stored)
  })
})

describe('TransactionManager.updateBalanceWithHiddenCategories', () => {
  function setupDOM() {
    document.body.innerHTML = '<span id="balance"></span>'
  }

  it('суммирует все транзакции когда нет скрытых категорий', () => {
    setupDOM()
    const mgr = makeManager()
    mgr.currentTransactions = sampleTransactions
    mgr.chartTarget = 'category'
    getHiddenCategories.mockReturnValue(new Set())
    mgr.updateBalanceWithHiddenCategories()
    expect(document.getElementById('balance').textContent).toBe('350')
  })

  it('исключает скрытую категорию из суммы', () => {
    setupDOM()
    const mgr = makeManager()
    mgr.currentTransactions = sampleTransactions
    mgr.chartTarget = 'category'
    getHiddenCategories.mockReturnValue(new Set(['Food']))
    mgr.updateBalanceWithHiddenCategories()
    expect(document.getElementById('balance').textContent).toBe('50')
  })

  it('фильтрует по rate при chartTarget="rate"', () => {
    setupDOM()
    const mgr = makeManager()
    mgr.currentTransactions = sampleTransactions
    mgr.chartTarget = 'rate'
    // RATES.get('waste')[0] === 'плохая'
    getHiddenCategories.mockReturnValue(new Set(['плохая']))
    mgr.updateBalanceWithHiddenCategories()
    // Исключаем waste=200, остаётся ok=100+50=150
    expect(document.getElementById('balance').textContent).toBe('150')
  })

  it('фильтрует по тегу при chartTarget="tags"', () => {
    setupDOM()
    const mgr = makeManager()
    mgr.currentTransactions = sampleTransactions
    mgr.chartTarget = 'tags'
    // Скрываем lunch и cafe и dinner — transaction id=1 (теги lunch,cafe) и id=2 (dinner) исключены
    // Transaction id=3 имеет пустые теги — не попадает в скрытые
    getHiddenCategories.mockReturnValue(new Set(['lunch', 'cafe', 'dinner']))
    mgr.updateBalanceWithHiddenCategories()
    expect(document.getElementById('balance').textContent).toBe('50')
  })
})

// ─── UX-тесты ────────────────────────────────────────────────────────────────

describe('TransactionManager.loadTransactions — DOM рендеринг', () => {
  function setupListDOM() {
    document.body.innerHTML = `
      <ul id="transactions"></ul>
      <span id="balance"></span>
      <canvas id="chart"></canvas>
    `
  }

  it('отображает транзакции как элементы списка', () => {
    setupListDOM()
    const mgr = makeManager()
    mgr.loadTransactions([...sampleTransactions])
    expect(document.querySelectorAll('.transaction-li').length).toBe(3)
  })

  it('каждый элемент содержит описание и сумму транзакции', () => {
    setupListDOM()
    const mgr = makeManager()
    mgr.loadTransactions([...sampleTransactions])
    const list = document.getElementById('transactions')
    expect(list.innerHTML).toContain('A')
    expect(list.innerHTML).toContain('100')
  })

  it('баланс равен сумме всех транзакций', () => {
    setupListDOM()
    const mgr = makeManager()
    mgr.loadTransactions([...sampleTransactions])
    expect(document.getElementById('balance').textContent).toBe('350')
  })

  it('пустой массив очищает список и обнуляет баланс', () => {
    setupListDOM()
    const mgr = makeManager()
    mgr.loadTransactions([])
    expect(document.querySelectorAll('.transaction-li').length).toBe(0)
    expect(document.getElementById('balance').textContent).toBe('0')
  })

  it('транзакции отсортированы от новейшей к старейшей', () => {
    setupListDOM()
    const mgr = makeManager()
    mgr.loadTransactions([...sampleTransactions])
    const items = document.querySelectorAll('.transaction-li')
    // sampleTransactions: dates 1000, 2000, 3000 → после сортировки: C, B, A
    expect(items[0].innerHTML).toContain('C')
    expect(items[2].innerHTML).toContain('A')
  })

  it('клик по элементу списка открывает модальное окно', () => {
    setupListDOM()
    const mgr = makeManager()
    mgr.loadTransactions([...sampleTransactions])
    const openModal = vi.spyOn(mgr, 'openTransactionModal').mockImplementation(() => {})
    document.querySelector('.transaction-li').click()
    expect(openModal).toHaveBeenCalled()
  })
})

describe('TransactionManager.openTransactionModal — открытие модального окна', () => {
  const transaction = {
    id: 1,
    description: 'Кофе',
    amount: 150,
    category: 'Food',
    rate: 'ok',
    tags: [],
    date: new Date(2024, 2, 15, 10, 30).getTime(),
  }

  function makeManagerForModal() {
    const db = { init: vi.fn(() => Promise.resolve()) }
    const realUI = new UI(null)
    const modal = {
      open: vi.fn((_title, content) => {
        document.getElementById('modal-body').innerHTML = content
      }),
      close: vi.fn(),
    }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, realUI, modal, navigation)
    mgr.allCategories = new Map()
    mgr.allTags = new Map()
    return mgr
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-body"></div>'
  })

  it('открывает модальное окно с именем транзакции', () => {
    const mgr = makeManagerForModal()
    mgr.openTransactionModal(transaction)
    expect(mgr.modal.open).toHaveBeenCalledWith('Кофе', expect.any(String))
  })

  it('поле даты заполнено корректно в формате YYYY-MM-DD', () => {
    const mgr = makeManagerForModal()
    mgr.openTransactionModal(transaction)
    expect(document.getElementById('modal-date-input').value).toBe('2024-03-15')
  })

  it('поле времени заполнено корректно в формате HH:MM', () => {
    const mgr = makeManagerForModal()
    mgr.openTransactionModal(transaction)
    expect(document.getElementById('modal-time-input').value).toBe('10:30')
  })

  it('select рейтинга установлен в значение транзакции', () => {
    const mgr = makeManagerForModal()
    mgr.openTransactionModal(transaction)
    expect(document.getElementById('modal-rate-select').value).toBe('ok')
  })

  it('открытие модального окна очищает теги формы (предотвращает дублирование дефолтного тега)', () => {
    const mgr = makeManagerForModal()
    mgr.ui.tags.push('дефолт')
    mgr.openTransactionModal(transaction)
    expect(mgr.ui.tags).toHaveLength(0)
  })
})

describe('TransactionManager.saveTransaction — сохранение изменений', () => {
  const transaction = {
    id: 1,
    description: 'Кофе',
    amount: 150,
    category: 'Food',
    rate: 'ok',
    tags: [],
    date: new Date(2024, 2, 15, 10, 30).getTime(),
  }

  function setupSaveDOM(tx) {
    document.body.innerHTML = `
      <input id="modal-description-input" value="${tx.description}">
      <input id="modal-amount-input" type="number" value="${tx.amount}">
      <input id="modal-category-input" value="${tx.category}">
      <select id="modal-rate-select">
        <option value="waste">плохая</option>
        <option value="ok" selected>ок</option>
        <option value="good">осознанная</option>
      </select>
      <input type="date" id="modal-date-input" value="2024-03-15">
      <input type="time" id="modal-time-input" value="10:30">
    `
  }

  function makeManagerForSave() {
    const db = {
      init: vi.fn(() => Promise.resolve()),
      updateTransaction: vi.fn((_tx, cb) => cb && cb()),
    }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
    }
    const modal = { open: vi.fn(), close: vi.fn() }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, ui, modal, navigation)
    mgr.allCategories = new Map([['Food', 2]])
    mgr.allTags = new Map()
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('вызывает db.updateTransaction с обновлёнными данными', () => {
    setupSaveDOM(transaction)
    const mgr = makeManagerForSave()
    mgr.saveTransaction({ ...transaction })
    expect(mgr.db.updateTransaction).toHaveBeenCalled()
  })

  it('закрывает модальное окно после сохранения', () => {
    setupSaveDOM(transaction)
    const mgr = makeManagerForSave()
    mgr.saveTransaction({ ...transaction })
    expect(mgr.modal.close).toHaveBeenCalled()
  })

  it('перезагружает список транзакций после сохранения', () => {
    setupSaveDOM(transaction)
    const mgr = makeManagerForSave()
    mgr.saveTransaction({ ...transaction })
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalled()
  })
})

describe('TransactionManager.deleteTransaction — удаление транзакции', () => {
  const transaction = {
    id: 42,
    description: 'Обед',
    amount: 300,
    category: 'Food',
    rate: 'ok',
    tags: ['lunch'],
  }

  function makeManagerForDelete() {
    const db = {
      init: vi.fn(() => Promise.resolve()),
      deleteTransaction: vi.fn((_id, cb) => cb && cb()),
    }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
    }
    const modal = { open: vi.fn(), close: vi.fn() }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, ui, modal, navigation)
    mgr.allCategories = new Map([['Food', 2]])
    mgr.allTags = new Map([['lunch', 1]])
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('вызывает db.deleteTransaction с id транзакции', () => {
    const mgr = makeManagerForDelete()
    mgr.deleteTransaction(transaction)
    expect(mgr.db.deleteTransaction).toHaveBeenCalledWith(42, expect.any(Function))
  })

  it('закрывает модальное окно после удаления', () => {
    const mgr = makeManagerForDelete()
    mgr.deleteTransaction(transaction)
    expect(mgr.modal.close).toHaveBeenCalled()
  })

  it('перезагружает список транзакций после удаления', () => {
    const mgr = makeManagerForDelete()
    mgr.deleteTransaction(transaction)
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalled()
  })
})

describe('TransactionManager.duplicateTransaction — дублирование транзакции', () => {
  const transaction = {
    id: 7,
    description: 'Завтрак',
    amount: 200,
    category: 'Food',
    rate: 'good',
    tags: ['breakfast'],
  }

  function makeManagerForDuplicate() {
    const db = {
      init: vi.fn(() => Promise.resolve()),
      addTransaction: vi.fn((_tx, cb) => cb && cb()),
    }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
    }
    const modal = { open: vi.fn(), close: vi.fn() }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, ui, modal, navigation)
    mgr.allCategories = new Map([['Food', 1]])
    mgr.allTags = new Map([['breakfast', 1]])
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('вызывает db.addTransaction без id (создаёт новую запись)', () => {
    const mgr = makeManagerForDuplicate()
    mgr.duplicateTransaction(transaction)
    expect(mgr.db.addTransaction).toHaveBeenCalled()
    const [added] = mgr.db.addTransaction.mock.calls[0]
    expect(added.id).toBeUndefined()
  })

  it('дублированная транзакция получает новую дату', () => {
    const mgr = makeManagerForDuplicate()
    const before = Date.now()
    mgr.duplicateTransaction(transaction)
    const [added] = mgr.db.addTransaction.mock.calls[0]
    expect(added.date).toBeGreaterThanOrEqual(before)
  })

  it('закрывает модальное окно после дублирования', () => {
    const mgr = makeManagerForDuplicate()
    mgr.duplicateTransaction(transaction)
    expect(mgr.modal.close).toHaveBeenCalled()
  })
})

describe('TransactionManager.setupTransactionForm — форма добавления', () => {
  function setupFormDOM() {
    document.body.innerHTML = `
      <form id="transaction-form">
        <input id="description" value="Кофе">
        <input id="amount" type="number" value="150">
        <input id="category-input" value="Food">
        <select id="rate-select"><option value="ok" selected>ок</option></select>
        <div id="tags-container"></div>
        <input id="tag-input" value="">
        <div id="tag-suggestion" style="display: none"></div>
        <button id="add-tag">+</button>
      </form>
    `
  }

  function makeManagerForForm() {
    const db = {
      init: vi.fn(() => Promise.resolve()),
      addTransaction: vi.fn((_tx, cb) => cb && cb()),
    }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
      renderTags: vi.fn(),
      initDefaultTag: vi.fn(),
    }
    const modal = { open: vi.fn(), close: vi.fn() }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, ui, modal, navigation)
    mgr.allCategories = new Map()
    mgr.allTags = new Map()
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('submit формы создаёт транзакцию с данными из полей', () => {
    setupFormDOM()
    const mgr = makeManagerForForm()
    mgr.setupTransactionForm()
    document.getElementById('transaction-form').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(mgr.db.addTransaction).toHaveBeenCalled()
    const [tx] = mgr.db.addTransaction.mock.calls[0]
    expect(tx.description).toBe('Кофе')
    expect(tx.amount).toBe(150)
    expect(tx.category).toBe('Food')
  })

  it('после submit происходит переход на главную страницу', () => {
    setupFormDOM()
    const mgr = makeManagerForForm()
    mgr.setupTransactionForm()
    document.getElementById('transaction-form').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(mgr.navigation.showPage).toHaveBeenCalledWith('home')
  })

  it('после submit очищаются теги', () => {
    setupFormDOM()
    const mgr = makeManagerForForm()
    mgr.setupTransactionForm()
    document.getElementById('transaction-form').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(mgr.ui.clearTags).toHaveBeenCalled()
  })

  it('после submit вызывается initDefaultTag с текущим дефолтным тегом', () => {
    setupFormDOM()
    Storage.getDefaultTag.mockReturnValue('еда')
    const mgr = makeManagerForForm()
    mgr.setupTransactionForm()
    document.getElementById('transaction-form').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(mgr.ui.initDefaultTag).toHaveBeenCalledWith('еда')
  })

  it('при наличии текста в поле тега кнопка "+" нажимается автоматически', () => {
    setupFormDOM()
    const mgr = makeManagerForForm()
    mgr.setupTransactionForm()
    const addTagSpy = vi.fn()
    document.getElementById('add-tag').addEventListener('click', addTagSpy)
    document.getElementById('tag-input').value = 'snack'
    document.getElementById('transaction-form').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(addTagSpy).toHaveBeenCalled()
  })
})

describe('TransactionManager.setupLimitSelect — выбор периода', () => {
  function setupLimitDOM() {
    document.body.innerHTML = `
      <select id="transactions-limit">
        <option value="all">Все</option>
        <option value="day">День</option>
        <option value="week">Неделя</option>
        <option value="month">Месяц</option>
        <option value="year">Год</option>
        <option value="custom">Произвольный</option>
      </select>
      <div id="custom-period-inputs" style="display: none">
        <input id="custom-start-date" type="date">
        <input id="custom-end-date" type="date">
      </div>
    `
  }

  function makeManagerForLimit(limit = 'all') {
    Storage.getLimit.mockReturnValue(limit)
    const db = { init: vi.fn(() => Promise.resolve()) }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
    }
    const modal = { open: vi.fn(), close: vi.fn() }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, ui, modal, navigation)
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('устанавливает начальное значение select из Storage', () => {
    setupLimitDOM()
    const mgr = makeManagerForLimit('month')
    mgr.setupLimitSelect()
    expect(document.getElementById('transactions-limit').value).toBe('month')
  })

  it('при начальном значении "custom" блок с датами виден сразу', () => {
    setupLimitDOM()
    const mgr = makeManagerForLimit('custom')
    mgr.setupLimitSelect()
    expect(document.getElementById('custom-period-inputs').style.display).toBe('flex')
  })

  it('изменение периода сохраняется в Storage', () => {
    setupLimitDOM()
    const mgr = makeManagerForLimit()
    mgr.setupLimitSelect()
    const select = document.getElementById('transactions-limit')
    select.value = 'week'
    select.dispatchEvent(new Event('change'))
    expect(Storage.setLimit).toHaveBeenCalledWith('week')
  })

  it('выбор "custom" показывает блок с датами', () => {
    setupLimitDOM()
    const mgr = makeManagerForLimit()
    mgr.setupLimitSelect()
    const select = document.getElementById('transactions-limit')
    select.value = 'custom'
    select.dispatchEvent(new Event('change'))
    expect(document.getElementById('custom-period-inputs').style.display).toBe('flex')
  })

  it('переключение с "custom" на другой период скрывает блок с датами', () => {
    setupLimitDOM()
    const mgr = makeManagerForLimit('custom')
    mgr.setupLimitSelect()
    const select = document.getElementById('transactions-limit')
    select.value = 'month'
    select.dispatchEvent(new Event('change'))
    expect(document.getElementById('custom-period-inputs').style.display).toBe('none')
  })

  it('изменение периода (не custom) перезагружает список транзакций', () => {
    setupLimitDOM()
    const mgr = makeManagerForLimit()
    mgr.setupLimitSelect()
    const select = document.getElementById('transactions-limit')
    select.value = 'week'
    select.dispatchEvent(new Event('change'))
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalled()
  })

  it('при наличии default tag добавляется опция с его именем', () => {
    setupLimitDOM()
    Storage.getDefaultTag.mockReturnValue('еда')
    const mgr = makeManagerForLimit()
    mgr.setupLimitSelect()
    const option = document.getElementById('transactions-limit').querySelector('option[value="default-tag"]')
    expect(option).not.toBeNull()
    expect(option.textContent).toBe('еда')
  })

  it('опция default-tag вставляется перед опцией custom', () => {
    setupLimitDOM()
    Storage.getDefaultTag.mockReturnValue('еда')
    const mgr = makeManagerForLimit()
    mgr.setupLimitSelect()
    const options = Array.from(document.getElementById('transactions-limit').options).map(o => o.value)
    expect(options.indexOf('default-tag')).toBeLessThan(options.indexOf('custom'))
  })

  it('без default tag опция default-tag не добавляется', () => {
    setupLimitDOM()
    Storage.getDefaultTag.mockReturnValue('')
    const mgr = makeManagerForLimit()
    mgr.setupLimitSelect()
    expect(document.getElementById('transactions-limit').querySelector('option[value="default-tag"]')).toBeNull()
  })

  it('если лимит "default-tag" но тег не задан — сбрасывается на "all"', () => {
    setupLimitDOM()
    Storage.getDefaultTag.mockReturnValue('')
    const mgr = makeManagerForLimit('default-tag')
    mgr.setupLimitSelect()
    expect(mgr.limit).toBe('all')
    expect(Storage.setLimit).toHaveBeenCalledWith('all')
  })
})

describe('TransactionManager.singleLoadTransactionsRender — фильтр по default tag', () => {
  function makeManagerForRender(limit, defaultTag = '') {
    Storage.getLimit.mockReturnValue(limit)
    Storage.getDefaultTag.mockReturnValue(defaultTag)
    const db = {
      init: vi.fn(() => Promise.resolve()),
      readOnlyTransaction: vi.fn((callbacks) => { callbacks[0](sampleTransactions) }),
      readOnlyTransactionByDate: vi.fn(),
    }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
    }
    const mgr = new TransactionManager(db, ui, { open: vi.fn(), close: vi.fn() }, { showPage: vi.fn() })
    vi.spyOn(mgr, 'loadTransactions').mockImplementation(() => {})
    return mgr
  }

  it('при лимите "default-tag" вызывает readOnlyTransaction, а не readOnlyTransactionByDate', () => {
    const mgr = makeManagerForRender('default-tag', 'lunch')
    mgr.singleLoadTransactionsRender()
    expect(mgr.db.readOnlyTransaction).toHaveBeenCalled()
    expect(mgr.db.readOnlyTransactionByDate).not.toHaveBeenCalled()
  })

  it('при лимите "default-tag" передаёт в loadTransactions только транзакции с нужным тегом', () => {
    const mgr = makeManagerForRender('default-tag', 'lunch')
    mgr.singleLoadTransactionsRender()
    const [filtered] = mgr.loadTransactions.mock.calls[0]
    // sampleTransactions: id=1 имеет ['lunch','cafe'], id=2 — ['dinner'], id=3 — []
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
  })

  it('при лимите "default-tag" и теге "dinner" возвращает правильную транзакцию', () => {
    const mgr = makeManagerForRender('default-tag', 'dinner')
    mgr.singleLoadTransactionsRender()
    const [filtered] = mgr.loadTransactions.mock.calls[0]
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(2)
  })

  it('если тег не задан и лимит "default-tag" — сбрасывает лимит на "all"', () => {
    const mgr = makeManagerForRender('default-tag', '')
    mgr.singleLoadTransactionsRender()
    expect(mgr.limit).toBe('all')
    expect(Storage.setLimit).toHaveBeenCalledWith('all')
  })

  it('если тег не задан и лимит "default-tag" — всё равно загружает транзакции (через "all")', () => {
    const mgr = makeManagerForRender('default-tag', '')
    mgr.singleLoadTransactionsRender()
    expect(mgr.db.readOnlyTransaction).toHaveBeenCalled()
  })
})

describe('TransactionManager.getTagStats — статистика по тегу', () => {
  const statsTransactions = [
    { id: 1, description: 'A', amount: 100, category: 'Food', rate: 'ok', tags: ['lunch', 'cafe'], date: 1000 },
    { id: 2, description: 'B', amount: 200, category: 'Food', rate: 'waste', tags: ['dinner'], date: 2000 },
    { id: 3, description: 'C', amount: 50, category: 'Transport', rate: 'ok', tags: ['lunch'], date: 3000 },
    { id: 4, description: 'D', amount: 80, category: 'Food', rate: 'ok', tags: [], date: 4000 },
  ]

  function makeManagerForStats(txs) {
    const db = {
      init: vi.fn(() => Promise.resolve()),
      readOnlyTransaction: vi.fn((callbacks) => callbacks[0](txs)),
    }
    const ui = { clearTags: vi.fn(), clearTagsToRemove: vi.fn(), getTags: vi.fn(() => []), getTagsToRemove: vi.fn(() => new Set()) }
    return new TransactionManager(db, ui, { open: vi.fn(), close: vi.fn() }, { showPage: vi.fn() })
  }

  it('возвращает правильное количество транзакций с тегом', () => {
    const mgr = makeManagerForStats(statsTransactions)
    let count
    mgr.getTagStats('lunch', (c) => { count = c })
    expect(count).toBe(2)
  })

  it('возвращает правильную сумму транзакций с тегом', () => {
    const mgr = makeManagerForStats(statsTransactions)
    let total
    mgr.getTagStats('lunch', (_, t) => { total = t })
    expect(total).toBe(150) // 100 + 50
  })

  it('работает корректно для тега с одной транзакцией', () => {
    const mgr = makeManagerForStats(statsTransactions)
    let count, total
    mgr.getTagStats('dinner', (c, t) => { count = c; total = t })
    expect(count).toBe(1)
    expect(total).toBe(200)
  })

  it('возвращает 0 и 0 для несуществующего тега', () => {
    const mgr = makeManagerForStats(statsTransactions)
    let count, total
    mgr.getTagStats('нет', (c, t) => { count = c; total = t })
    expect(count).toBe(0)
    expect(total).toBe(0)
  })

  it('не учитывает транзакции без совпадающего тега', () => {
    const mgr = makeManagerForStats(statsTransactions)
    let count
    mgr.getTagStats('cafe', (c) => { count = c })
    expect(count).toBe(1)
  })
})

describe('TransactionManager.renameTag — переименование тега', () => {
  const renameTransactions = [
    { id: 1, description: 'A', amount: 100, category: 'Food', rate: 'ok', tags: ['lunch', 'cafe'], date: 1000 },
    { id: 2, description: 'B', amount: 200, category: 'Food', rate: 'waste', tags: ['dinner'], date: 2000 },
    { id: 3, description: 'C', amount: 50, category: 'Transport', rate: 'ok', tags: ['lunch'], date: 3000 },
  ]

  function makeManagerForRename(txs) {
    const db = {
      init: vi.fn(() => Promise.resolve()),
      readOnlyTransaction: vi.fn((callbacks) => callbacks[0](txs)),
      updateTransaction: vi.fn((_tx, cb) => cb && cb()),
    }
    const ui = { clearTags: vi.fn(), clearTagsToRemove: vi.fn(), getTags: vi.fn(() => []), getTagsToRemove: vi.fn(() => new Set()) }
    const mgr = new TransactionManager(db, ui, { open: vi.fn(), close: vi.fn() }, { showPage: vi.fn() })
    mgr.allTags = new Map([['lunch', 2], ['cafe', 1], ['dinner', 1]])
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('вызывает updateTransaction для каждой транзакции с тегом', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    expect(mgr.db.updateTransaction).toHaveBeenCalledTimes(2)
  })

  it('не трогает транзакции без переименовываемого тега', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('dinner', 'supper', vi.fn())
    expect(mgr.db.updateTransaction).toHaveBeenCalledTimes(1)
    const [updated] = mgr.db.updateTransaction.mock.calls[0]
    expect(updated.id).toBe(2)
  })

  it('заменяет старый тег на новый в массиве тегов', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    const allUpdatedTags = mgr.db.updateTransaction.mock.calls.map(([tx]) => tx.tags)
    allUpdatedTags.forEach(tags => {
      expect(tags).toContain('brunch')
      expect(tags).not.toContain('lunch')
    })
  })

  it('сохраняет остальные теги транзакции нетронутыми', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    const tx1 = mgr.db.updateTransaction.mock.calls.find(([tx]) => tx.id === 1)?.[0]
    expect(tx1.tags).toContain('cafe')
  })

  it('удаляет старый тег из allTags', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    expect(mgr.allTags.has('lunch')).toBe(false)
  })

  it('добавляет новый тег в allTags с корректным счётчиком', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    expect(mgr.allTags.get('brunch')).toBe(2)
  })

  it('при слиянии с существующим тегом суммирует счётчики', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'cafe', vi.fn())
    expect(mgr.allTags.get('cafe')).toBe(3) // 1 (cafe) + 2 (lunch)
    expect(mgr.allTags.has('lunch')).toBe(false)
  })

  it('дедуплицирует теги если транзакция уже содержала новый тег', () => {
    const txWithBoth = [{ id: 1, description: 'A', amount: 100, category: 'Food', rate: 'ok', tags: ['lunch', 'cafe'], date: 1000 }]
    const mgr = makeManagerForRename(txWithBoth)
    mgr.allTags = new Map([['lunch', 1], ['cafe', 1]])
    mgr.renameTag('lunch', 'cafe', vi.fn())
    const [updated] = mgr.db.updateTransaction.mock.calls[0]
    expect(updated.tags.filter(t => t === 'cafe').length).toBe(1)
  })

  it('сохраняет обновлённые теги в Storage', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    expect(Storage.saveTags).toHaveBeenCalledWith(mgr.allTags)
  })

  it('вызывает singleLoadTransactionsRender после всех обновлений', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('lunch', 'brunch', vi.fn())
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalledTimes(1)
  })

  it('вызывает onComplete после завершения всех обновлений', () => {
    const mgr = makeManagerForRename(renameTransactions)
    const onComplete = vi.fn()
    mgr.renameTag('lunch', 'brunch', onComplete)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('сразу вызывает onComplete если нет транзакций с указанным тегом', () => {
    const mgr = makeManagerForRename(renameTransactions)
    const onComplete = vi.fn()
    mgr.renameTag('несуществующий', 'новый', onComplete)
    expect(mgr.db.updateTransaction).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalled()
  })

  it('не вызывает singleLoadTransactionsRender если нечего обновлять', () => {
    const mgr = makeManagerForRename(renameTransactions)
    mgr.renameTag('несуществующий', 'новый', vi.fn())
    expect(mgr.singleLoadTransactionsRender).not.toHaveBeenCalled()
  })
})

describe('TransactionManager.setupChartTargetSelect — выбор разбивки графика', () => {
  function setupChartTargetDOM() {
    document.body.innerHTML = `
      <select id="chart-target">
        <option value="category">Категория</option>
        <option value="rate">Рейтинг</option>
        <option value="tags">Теги</option>
      </select>
    `
  }

  function makeManagerForChartTarget(chartTarget = 'category') {
    Storage.getChartTarget.mockReturnValue(chartTarget)
    const db = { init: vi.fn(() => Promise.resolve()) }
    const ui = {
      clearTags: vi.fn(),
      clearTagsToRemove: vi.fn(),
      getTags: vi.fn(() => []),
      getTagsToRemove: vi.fn(() => new Set()),
    }
    const modal = { open: vi.fn(), close: vi.fn() }
    const navigation = { showPage: vi.fn() }
    const mgr = new TransactionManager(db, ui, modal, navigation)
    vi.spyOn(mgr, 'singleLoadTransactionsRender').mockImplementation(() => {})
    return mgr
  }

  it('устанавливает начальное значение select из Storage', () => {
    setupChartTargetDOM()
    const mgr = makeManagerForChartTarget('rate')
    mgr.setupChartTargetSelect()
    expect(document.getElementById('chart-target').value).toBe('rate')
  })

  it('изменение цели сохраняется в Storage', () => {
    setupChartTargetDOM()
    const mgr = makeManagerForChartTarget()
    mgr.setupChartTargetSelect()
    const select = document.getElementById('chart-target')
    select.value = 'tags'
    select.dispatchEvent(new Event('change'))
    expect(Storage.setChartTarget).toHaveBeenCalledWith('tags')
  })

  it('изменение цели перезагружает список транзакций', () => {
    setupChartTargetDOM()
    const mgr = makeManagerForChartTarget()
    mgr.setupChartTargetSelect()
    const select = document.getElementById('chart-target')
    select.value = 'rate'
    select.dispatchEvent(new Event('change'))
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalled()
  })
})

describe('TransactionManager.getAllCategories / getAllTags', () => {
  it('getAllCategories возвращает allCategories', () => {
    const mgr = makeManager()
    mgr.loadAllCategories(sampleTransactions)
    expect(mgr.getAllCategories()).toBe(mgr.allCategories)
  })

  it('getAllTags возвращает allTags', () => {
    const mgr = makeManager()
    mgr.loadAllTags(sampleTransactions)
    expect(mgr.getAllTags()).toBe(mgr.allTags)
  })
})
