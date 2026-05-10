import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../js/storage.js', () => ({
  Storage: {
    setDemoMode: vi.fn(),
    getDemoMode: vi.fn(() => false),
    clearTags: vi.fn(),
    clearCategories: vi.fn(),
  },
}))

import { Demo, setupDemoUI } from '../js/demo.js'
import { Storage } from '../js/storage.js'

const sampleDemo = [
  { id: 1, description: 'A', amount: 100, category: 'X', rate: 'ok', tags: [], date: 1000 },
  { id: 2, description: 'B', amount: 200, category: 'Y', rate: 'waste', tags: ['t'], date: 2000 },
]

function makeDB() {
  return {
    clearAllTransactions: vi.fn((cb) => cb && cb()),
    bulkAddTransactions: vi.fn((_txs, cb) => cb && cb()),
    readOnlyTransaction: vi.fn((fns, onComplete) => {
      fns.forEach((fn) => fn([]))
      if (onComplete) onComplete()
    }),
  }
}

function makeManager() {
  return {
    singleLoadTransactionsRender: vi.fn(),
    loadAllCategories: vi.fn(),
    loadAllTags: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Storage.getDemoMode.mockReturnValue(false)
})

describe('Demo.isDemo', () => {
  it('возвращает значение из Storage.getDemoMode', () => {
    Storage.getDemoMode.mockReturnValue(true)
    const demo = new Demo(makeDB(), makeManager())
    expect(demo.isDemo()).toBe(true)
  })
})

describe('Demo.loadDemoData', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sampleDemo),
      })
    )
  })

  afterEach(() => {
    delete global.fetch
  })

  it('запрашивает demo-data.json', async () => {
    const demo = new Demo(makeDB(), makeManager())
    await demo.loadDemoData()
    expect(global.fetch).toHaveBeenCalledWith('./demo-data.json')
  })

  it('очищает базу перед загрузкой', async () => {
    const db = makeDB()
    const demo = new Demo(db, makeManager())
    await demo.loadDemoData()
    expect(db.clearAllTransactions).toHaveBeenCalled()
  })

  it('массово добавляет транзакции из demo-data', async () => {
    const db = makeDB()
    const demo = new Demo(db, makeManager())
    await demo.loadDemoData()
    expect(db.bulkAddTransactions).toHaveBeenCalled()
    const [added] = db.bulkAddTransactions.mock.calls[0]
    expect(added).toHaveLength(2)
    expect(added[0].description).toBe('A')
  })

  it('удаляет id из импортируемых транзакций (autoIncrement выдаст новые)', async () => {
    const db = makeDB()
    const demo = new Demo(db, makeManager())
    await demo.loadDemoData()
    const [added] = db.bulkAddTransactions.mock.calls[0]
    added.forEach((t) => expect(t).not.toHaveProperty('id'))
  })

  it('очищает закэшированные категории и теги', async () => {
    const demo = new Demo(makeDB(), makeManager())
    await demo.loadDemoData()
    expect(Storage.clearCategories).toHaveBeenCalled()
    expect(Storage.clearTags).toHaveBeenCalled()
  })

  it('включает режим демо', async () => {
    const demo = new Demo(makeDB(), makeManager())
    await demo.loadDemoData()
    expect(Storage.setDemoMode).toHaveBeenCalledWith(true)
  })

  it('перерисовывает транзакции после загрузки', async () => {
    const mgr = makeManager()
    const demo = new Demo(makeDB(), mgr)
    await demo.loadDemoData()
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalled()
  })

  it('перезагружает категории и теги в памяти менеджера', async () => {
    const mgr = makeManager()
    const demo = new Demo(makeDB(), mgr)
    await demo.loadDemoData()
    expect(mgr.loadAllCategories).toHaveBeenCalled()
    expect(mgr.loadAllTags).toHaveBeenCalled()
  })

  it('бросает ошибку, если ответ не ok', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false }))
    const demo = new Demo(makeDB(), makeManager())
    await expect(demo.loadDemoData()).rejects.toThrow()
  })

  it('бросает ошибку, если в ответе нет массива transactions', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ invalid: true }) })
    )
    const demo = new Demo(makeDB(), makeManager())
    await expect(demo.loadDemoData()).rejects.toThrow()
  })

  it('принимает новый формат { transactions: [...] }', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ transactions: sampleDemo }) })
    )
    const db = makeDB()
    const demo = new Demo(db, makeManager())
    await demo.loadDemoData()
    expect(db.bulkAddTransactions).toHaveBeenCalled()
    const [added] = db.bulkAddTransactions.mock.calls[0]
    expect(added).toHaveLength(2)
    expect(added[0].description).toBe('A')
    added.forEach((t) => expect(t).not.toHaveProperty('id'))
  })
})

describe('Demo.clearDemoData', () => {
  it('очищает базу', async () => {
    const db = makeDB()
    const demo = new Demo(db, makeManager())
    await demo.clearDemoData()
    expect(db.clearAllTransactions).toHaveBeenCalled()
  })

  it('очищает закэшированные категории и теги', async () => {
    const demo = new Demo(makeDB(), makeManager())
    await demo.clearDemoData()
    expect(Storage.clearCategories).toHaveBeenCalled()
    expect(Storage.clearTags).toHaveBeenCalled()
  })

  it('выключает режим демо', async () => {
    const demo = new Demo(makeDB(), makeManager())
    await demo.clearDemoData()
    expect(Storage.setDemoMode).toHaveBeenCalledWith(false)
  })

  it('перерисовывает транзакции', async () => {
    const mgr = makeManager()
    const demo = new Demo(makeDB(), mgr)
    await demo.clearDemoData()
    expect(mgr.singleLoadTransactionsRender).toHaveBeenCalled()
  })
})

describe('setupDemoUI', () => {
  function setupDOM() {
    document.body.innerHTML = `
      <div id="demo-banner" style="display:none"></div>
      <button id="demo-clear-btn"></button>
    `
  }

  afterEach(() => {
    delete window.loadDemo
  })

  it('баннер скрыт когда не в демо-режиме', () => {
    setupDOM()
    Storage.getDemoMode.mockReturnValue(false)
    const demo = new Demo(makeDB(), makeManager())
    setupDemoUI(demo)
    expect(document.getElementById('demo-banner').style.display).toBe('none')
  })

  it('баннер виден когда в демо-режиме', () => {
    setupDOM()
    Storage.getDemoMode.mockReturnValue(true)
    const demo = new Demo(makeDB(), makeManager())
    setupDemoUI(demo)
    expect(document.getElementById('demo-banner').style.display).toBe('flex')
  })

  it('экспонирует window.loadDemo', () => {
    setupDOM()
    const demo = new Demo(makeDB(), makeManager())
    setupDemoUI(demo)
    expect(typeof window.loadDemo).toBe('function')
  })

  it('клик по очистке вызывает clearDemoData при подтверждении', async () => {
    setupDOM()
    const demo = new Demo(makeDB(), makeManager())
    const spy = vi.spyOn(demo, 'clearDemoData').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setupDemoUI(demo)
    document.getElementById('demo-clear-btn').click()
    expect(spy).toHaveBeenCalled()
  })

  it('клик по очистке не вызывает clearDemoData без подтверждения', () => {
    setupDOM()
    const demo = new Demo(makeDB(), makeManager())
    const spy = vi.spyOn(demo, 'clearDemoData').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    setupDemoUI(demo)
    document.getElementById('demo-clear-btn').click()
    expect(spy).not.toHaveBeenCalled()
  })
})
