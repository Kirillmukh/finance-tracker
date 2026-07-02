import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImportExport } from '../js/import-export.js'

// jsdom localStorage Proxy не всегда корректно обрабатывает delete — стабим простым моком
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

// Контент который вернёт FileReader в текущем тесте
let fileReaderContent = '[]'
let fileReaderShouldError = false

// Синхронный мок FileReader — вызывает onload или onerror через микрозадачу
class MockFileReader {
  readAsText(_file) {
    queueMicrotask(() => {
      if (fileReaderShouldError) {
        if (this.onerror) this.onerror()
      } else if (this.onload) {
        this.onload({ target: { result: fileReaderContent } })
      }
    })
  }
}

global.FileReader = MockFileReader

function setupDOM() {
  document.body.innerHTML = `
    <button id="export-btn">Экспорт</button>
    <button id="export-filtered-btn">Экспорт по фильтру</button>
    <button id="import-btn">Импорт</button>
    <input id="input-json" type="file" />
    <div id="file-upload-zone"></div>
    <span id="file-name-display"></span>
    <div id="export-status"></div>
    <div id="import-status"></div>
    <select id="theme-select">
      <option value="system">system</option>
      <option value="light">light</option>
      <option value="dark">dark</option>
    </select>
    <select id="default-rate-select">
      <option value="waste">waste</option>
      <option value="ok" selected>ok</option>
      <option value="good">good</option>
    </select>
    <input id="default-tag-input" type="text" />
    <select id="transactions-limit">
      <option value="all">all</option>
      <option value="custom">custom</option>
    </select>
  `
}

function makeDB(transactions = []) {
  return {
    readOnlyTransaction: vi.fn((fns, onComplete) => {
      fns.forEach((fn) => fn(transactions))
      if (onComplete) onComplete()
    }),
    clearAllTransactions: vi.fn((onComplete) => {
      if (onComplete) onComplete()
    }),
    bulkAddTransactions: vi.fn((txs, onComplete) => {
      if (onComplete) onComplete()
    }),
  }
}

function makeTransactionManager(filteredTransactions = [], limit = 'all') {
  return {
    limit,
    singleLoadTransactionsRender: vi.fn(),
    loadAllCategories: vi.fn(),
    loadAllTags: vi.fn(),
    loadAllDescriptions: vi.fn(),
    readTransactionsForCurrentLimit: vi.fn(function (cb) {
      cb(filteredTransactions)
    }),
  }
}

function setFile() {
  const file = new File(['dummy'], 'data.json', { type: 'application/json' })
  Object.defineProperty(document.getElementById('input-json'), 'files', {
    value: [file],
    configurable: true,
  })
}

let db, manager, ie

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  setupDOM()
  vi.clearAllMocks()
  fileReaderContent = '[]'
  fileReaderShouldError = false
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  db = makeDB()
  manager = makeTransactionManager()
  ie = new ImportExport(db, manager)
})

describe('ImportExport.exportData', () => {
  it('читает транзакции из базы данных', () => {
    ie.exportData()
    expect(db.readOnlyTransaction).toHaveBeenCalled()
  })

  it('вызывает URL.createObjectURL (значит Blob был создан)', () => {
    ie.exportData()
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('создаёт ссылку для скачивания', () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    ie.exportData()
    const aCalls = createElementSpy.mock.calls.filter(([tag]) => tag === 'a')
    expect(aCalls.length).toBeGreaterThan(0)
  })

  it('устанавливает статус после экспорта', () => {
    ie.exportData()
    expect(document.getElementById('export-status').textContent).toBe('Успешно экспортировано!')
  })

  it('имя файла содержит дату в формате ДД.ММ.ГГГГ', () => {
    let downloadName = ''
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag)
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          get: () => downloadName,
          set: (v) => { downloadName = v },
          configurable: true,
        })
      }
      return el
    })
    ie.exportData()
    expect(downloadName).toMatch(/^\d{2}\.\d{2}\.\d{4}\.json$/)
  })

  it('экспортирует JSON в формате { transactions: [...], settings: {...} }', () => {
    const txs = [{ id: 1, description: 'X', amount: 10, category: 'A', rate: 'ok', tags: [], date: 1 }]
    db = makeDB(txs)
    manager = makeTransactionManager()
    ie = new ImportExport(db, manager)
    let captured = null
    const origBlob = global.Blob
    global.Blob = vi.fn(function (parts) {
      captured = parts[0]
      return new origBlob(parts)
    })
    ie.exportData()
    global.Blob = origBlob
    const parsed = JSON.parse(captured)
    expect(parsed).toMatchObject({ transactions: txs })
    expect(parsed.settings).toEqual({ defaultTag: '', defaultRate: 'ok', theme: 'system' })
  })

  it('экспортирует settings с текущими значениями из localStorage', () => {
    localStorage.defaultTag = 'work'
    localStorage.defaultRate = 'good'
    localStorage.theme = 'dark'
    db = makeDB([])
    manager = makeTransactionManager()
    ie = new ImportExport(db, manager)
    let captured = null
    const origBlob = global.Blob
    global.Blob = vi.fn(function (parts) {
      captured = parts[0]
      return new origBlob(parts)
    })
    ie.exportData()
    global.Blob = origBlob
    const parsed = JSON.parse(captured)
    expect(parsed.settings).toEqual({ defaultTag: 'work', defaultRate: 'good', theme: 'dark' })
  })
})

describe('ImportExport.exportFilteredData', () => {
  function captureDownloadName() {
    const captured = { name: '' }
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag)
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          get: () => captured.name,
          set: (v) => { captured.name = v },
          configurable: true,
        })
      }
      return el
    })
    return captured
  }

  it('читает транзакции через readTransactionsForCurrentLimit, а не всю базу', () => {
    ie.exportFilteredData()
    expect(manager.readTransactionsForCurrentLimit).toHaveBeenCalled()
    expect(db.readOnlyTransaction).not.toHaveBeenCalled()
  })

  it.each([
    ['day', 'day'],
    ['week', 'week'],
    ['month', 'month'],
    ['year', 'year'],
    ['custom', 'custom'],
    ['all', 'all'],
    ['default-tag', 'default_tag'],
  ])('limit=%s — имя файла оканчивается на -%s.json', (limit, suffix) => {
    manager = makeTransactionManager([], limit)
    ie = new ImportExport(db, manager)
    const captured = captureDownloadName()
    ie.exportFilteredData()
    expect(captured.name).toMatch(new RegExp(`^\\d{2}\\.\\d{2}\\.\\d{4}-${suffix}\\.json$`))
  })

  it('суффикс берётся из limit ПОСЛЕ выборки (сброс default-tag → all)', () => {
    manager = makeTransactionManager()
    manager.limit = 'default-tag'
    manager.readTransactionsForCurrentLimit = vi.fn(function (cb) {
      // реальный метод сбрасывает исчезнувший default-tag на all до колбэка
      manager.limit = 'all'
      cb([])
    })
    ie = new ImportExport(db, manager)
    const captured = captureDownloadName()
    ie.exportFilteredData()
    expect(captured.name).toMatch(/-all\.json$/)
  })

  it('экспортирует отфильтрованные транзакции в формате { transactions, settings }', () => {
    const txs = [{ id: 1, description: 'X', amount: 10, category: 'A', rate: 'ok', tags: [], date: 1 }]
    manager = makeTransactionManager(txs, 'day')
    ie = new ImportExport(db, manager)
    let captured = null
    const origBlob = global.Blob
    global.Blob = vi.fn(function (parts) {
      captured = parts[0]
      return new origBlob(parts)
    })
    ie.exportFilteredData()
    global.Blob = origBlob
    const parsed = JSON.parse(captured)
    expect(parsed).toMatchObject({ transactions: txs })
    expect(parsed.settings).toEqual({ defaultTag: '', defaultRate: 'ok', theme: 'system' })
  })

  it('устанавливает статус после экспорта', () => {
    ie.exportFilteredData()
    expect(document.getElementById('export-status').textContent).toBe('Успешно экспортировано!')
  })

  it('клик по #export-filtered-btn вызывает экспорт по фильтру', () => {
    document.getElementById('export-filtered-btn').dispatchEvent(new Event('click'))
    expect(manager.readTransactionsForCurrentLimit).toHaveBeenCalled()
  })
})

describe('ImportExport.importData', () => {
  const validJSON = JSON.stringify({
    transactions: [
      { description: 'Imported', amount: 300, category: 'Food', rate: 'ok', tags: [], date: 1000 },
    ],
  })

  it('показывает сообщение если файл не выбран', () => {
    Object.defineProperty(document.getElementById('input-json'), 'files', {
      value: [],
      configurable: true,
    })
    ie.importData()
    const status = document.getElementById('import-status')
    expect(status.textContent).toBe('Файл не выбран!')
    expect(status.classList.contains('error')).toBe(true)
  })

  it('устанавливает статус после успешного импорта', async () => {
    setFile()
    fileReaderContent = validJSON
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
    expect(document.getElementById('import-status').classList.contains('error')).toBe(false)
  })

  it('не показывает "Успешно импортировано!" сразу после старта импорта', () => {
    setFile()
    fileReaderContent = validJSON
    ie.importData()
    expect(document.getElementById('import-status').textContent).toBe('')
  })

  it('очищает базу перед импортом', async () => {
    setFile()
    fileReaderContent = validJSON
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.clearAllTransactions).toHaveBeenCalled()
  })

  it('вызывает bulkAddTransactions с данными из файла', async () => {
    setFile()
    fileReaderContent = validJSON
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).toHaveBeenCalled()
    const [txs] = db.bulkAddTransactions.mock.calls[0]
    expect(txs[0].description).toBe('Imported')
  })

  it('после импорта перерисовывает транзакции', async () => {
    setFile()
    fileReaderContent = validJSON
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(manager.singleLoadTransactionsRender).toHaveBeenCalled()
  })

  it('не вызывает bulkAdd если JSON не массив и не объект с transactions', async () => {
    setFile()
    fileReaderContent = JSON.stringify({ invalid: true })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('импортирует новый формат { transactions: [...] }', async () => {
    setFile()
    const tx = { description: 'New', amount: 50, category: 'A', rate: 'ok', tags: [], date: 1 }
    fileReaderContent = JSON.stringify({ transactions: [tx] })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).toHaveBeenCalled()
    const [txs] = db.bulkAddTransactions.mock.calls[0]
    expect(txs).toEqual([tx])
  })

  it('обратная совместимость: импортирует старый формат [...] без обёртки', async () => {
    setFile()
    const tx = { description: 'Old', amount: 50, category: 'A', rate: 'ok', tags: [], date: 1 }
    fileReaderContent = JSON.stringify([tx])
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).toHaveBeenCalled()
    const [txs] = db.bulkAddTransactions.mock.calls[0]
    expect(txs).toEqual([tx])
  })

  it('не вызывает bulkAdd если transactions внутри объекта не массив', async () => {
    setFile()
    fileReaderContent = JSON.stringify({ transactions: { foo: 1 } })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('при невалидном JSON не бросает исключение и не вызывает bulkAdd', async () => {
    setFile()
    fileReaderContent = 'not { valid json'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => ie.importData()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('при невалидном JSON показывает сообщение об ошибке и не показывает успех', async () => {
    setFile()
    fileReaderContent = 'not { valid json'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    const status = document.getElementById('import-status')
    expect(status.textContent).toBe('Ошибка: файл не является валидным JSON')
    expect(status.classList.contains('error')).toBe(true)
    consoleSpy.mockRestore()
  })

  it('при неверной структуре JSON показывает сообщение "неверный формат файла"', async () => {
    setFile()
    fileReaderContent = JSON.stringify({ invalid: true })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    const status = document.getElementById('import-status')
    expect(status.textContent).toBe('Ошибка: неверный формат файла')
    expect(status.classList.contains('error')).toBe(true)
  })

  it('при некорректной транзакции показывает её позицию и причину, не вызывает bulkAdd', async () => {
    setFile()
    fileReaderContent = JSON.stringify({
      transactions: [
        { description: 'OK', amount: 100, category: 'A', rate: 'ok', tags: [], date: 1 },
        { description: 'Bad', amount: 'NaN', category: 'A', rate: 'ok', tags: [], date: 2 },
      ],
    })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    const status = document.getElementById('import-status')
    expect(status.textContent).toBe(
      'Ошибка: некорректная транзакция в позиции 2 — поле "amount" должно быть числом (получено: string)',
    )
    expect(status.classList.contains('error')).toBe(true)
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('отвергает транзакцию с некорректным rate', async () => {
    setFile()
    fileReaderContent = JSON.stringify({
      transactions: [
        { description: 'X', amount: 1, category: 'A', rate: 'unknown', tags: [], date: 1 },
      ],
    })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('отвергает транзакцию с tags, не являющимися массивом', async () => {
    setFile()
    fileReaderContent = JSON.stringify({
      transactions: [
        { description: 'X', amount: 1, category: 'A', rate: 'ok', tags: 'foo', date: 1 },
      ],
    })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('отвергает транзакцию с отсутствующим полем date', async () => {
    setFile()
    fileReaderContent = JSON.stringify({
      transactions: [
        { description: 'X', amount: 1, category: 'A', rate: 'ok', tags: [] },
      ],
    })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('пустой массив транзакций считается валидным', async () => {
    setFile()
    fileReaderContent = JSON.stringify({ transactions: [] })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).toHaveBeenCalled()
    expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
  })

  it('при ошибке FileReader не бросает исключение и показывает ошибку', async () => {
    setFile()
    fileReaderShouldError = true
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => ie.importData()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(consoleSpy).toHaveBeenCalled()
    const status = document.getElementById('import-status')
    expect(status.textContent).toBe('Ошибка чтения файла')
    expect(status.classList.contains('error')).toBe(true)
    consoleSpy.mockRestore()
  })

  it('при последующем успешном импорте после ошибки сбрасывает класс error', async () => {
    setFile()
    fileReaderContent = 'broken'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('import-status').classList.contains('error')).toBe(true)

    setFile()
    fileReaderContent = validJSON
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('import-status').classList.contains('error')).toBe(false)
    consoleSpy.mockRestore()
  })

  describe('валидация импорта (полное покрытие)', () => {
    const validTx = (overrides = {}) => ({
      description: 'X',
      amount: 1,
      category: 'Cat',
      rate: 'ok',
      tags: [],
      date: 1000,
      ...overrides,
    })

    const flush = () => new Promise((r) => setTimeout(r, 0))

    async function importPayload(payload) {
      setFile()
      fileReaderContent = typeof payload === 'string' ? payload : JSON.stringify(payload)
      ie.importData()
      await flush()
    }

    describe('JSON.parse', () => {
      it.each([
        ['битый синтаксис', 'not { valid json'],
        ['пустая строка', ''],
        ['незакрытая скобка', '{'],
        ['незакрытый массив', '['],
        ['лишняя запятая', '[1,]'],
      ])('%s — сообщение о невалидном JSON', async (_label, raw) => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        await importPayload(raw)
        expect(document.getElementById('import-status').textContent).toBe(
          'Ошибка: файл не является валидным JSON',
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
      })
    })

    describe('корень документа — неверный формат файла', () => {
      it.each([
        ['JSON null', 'null'],
        ['JSON true', 'true'],
        ['JSON false', 'false'],
        ['число', '42'],
        ['строка', '"hello"'],
        ['пустая строка как значение', '""'],
        ['пустой объект', '{}'],
        ['объект без transactions', '{"foo":1}'],
        ['transactions: null', '{"transactions":null}'],
        ['transactions: число', '{"transactions":42}'],
        ['transactions: строка', '{"transactions":"x"}'],
        ['transactions: объект', '{"transactions":{}}'],
        ['transactions: true', '{"transactions":true}'],
      ])('%s', async (_label, raw) => {
        await importPayload(raw)
        expect(document.getElementById('import-status').textContent).toBe('Ошибка: неверный формат файла')
        expect(document.getElementById('import-status').classList.contains('error')).toBe(true)
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
        expect(db.clearAllTransactions).not.toHaveBeenCalled()
      })
    })

    describe('элемент списка транзакций — не объект', () => {
      it.each([
        ['null', [null]],
        ['число', [1]],
        ['строка', ['text']],
        ['boolean true', [true]],
        ['boolean false', [false]],
        ['массив (массив — объект, но без полей)', [[]]],
      ])('%s — позиция 1', async (_label, transactions) => {
        await importPayload(transactions)
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })
    })

    describe('поле description', () => {
      it.each([
        ['отсутствует', () => {
          const o = validTx()
          delete o.description
          return o
        }],
        ['null', () => validTx({ description: null })],
        ['число', () => validTx({ description: 1 })],
        ['boolean', () => validTx({ description: true })],
        ['массив', () => validTx({ description: [] })],
        ['объект', () => validTx({ description: {} })],
      ])('%s', async (_label, makeTx) => {
        await importPayload([makeTx()])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it('пустая строка — допустима', async () => {
        await importPayload([validTx({ description: '' })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
        expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
      })
    })

    describe('поле amount', () => {
      it.each([
        ['отсутствует', () => {
          const o = validTx()
          delete o.amount
          return o
        }],
        ['null (из JSON)', () => validTx({ amount: null })],
        ['строка', () => validTx({ amount: '100' })],
        ['boolean', () => validTx({ amount: true })],
        ['массив', () => validTx({ amount: [] })],
        ['объект', () => validTx({ amount: {} })],
      ])('%s', async (_label, makeTx) => {
        await importPayload([makeTx()])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it.each([
        ['ноль', 0],
        ['отрицательное', -50.5],
        ['дробное', 0.01],
      ])('%s — допустимо', async (_label, amount) => {
        await importPayload([validTx({ amount })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
        expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
      })
    })

    describe('поле category', () => {
      it.each([
        ['отсутствует', () => {
          const o = validTx()
          delete o.category
          return o
        }],
        ['null', () => validTx({ category: null })],
        ['число', () => validTx({ category: 1 })],
        ['boolean', () => validTx({ category: false })],
        ['массив', () => validTx({ category: [] })],
      ])('%s', async (_label, makeTx) => {
        await importPayload([makeTx()])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it('пустая строка — допустима', async () => {
        await importPayload([validTx({ category: '' })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
      })
    })

    describe('поле rate', () => {
      it.each([
        ['отсутствует', () => {
          const o = validTx()
          delete o.rate
          return o
        }],
        ['null', () => validTx({ rate: null })],
        ['пустая строка', () => validTx({ rate: '' })],
        ['неизвестное значение', () => validTx({ rate: 'best' })],
        ['русские подписи', () => validTx({ rate: 'плохая' })],
        ['число', () => validTx({ rate: 1 })],
        ['boolean', () => validTx({ rate: true })],
      ])('%s', async (_label, makeTx) => {
        await importPayload([makeTx()])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it.each([
        ['waste', 'waste'],
        ['ok', 'ok'],
        ['good', 'good'],
      ])('rate=%s — допустимо', async (_label, rate) => {
        await importPayload([validTx({ rate })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
        expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
      })
    })

    describe('поле tags', () => {
      it.each([
        ['отсутствует', () => {
          const o = validTx()
          delete o.tags
          return o
        }],
        ['null', () => validTx({ tags: null })],
        ['строка', () => validTx({ tags: 'a,b' })],
        ['число', () => validTx({ tags: 1 })],
        ['объект', () => validTx({ tags: {} })],
        ['элемент не строка: число', () => validTx({ tags: [1] })],
        ['элемент не строка: null', () => validTx({ tags: [null] })],
        ['элемент не строка: объект', () => validTx({ tags: [{}] })],
        ['элемент не строка: boolean', () => validTx({ tags: [true] })],
      ])('%s', async (_label, makeTx) => {
        await importPayload([makeTx()])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it('несколько строковых тегов — допустимо', async () => {
        await importPayload([validTx({ tags: ['a', 'b', 'c'] })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
        const [txs] = db.bulkAddTransactions.mock.calls[0]
        expect(txs[0].tags).toEqual(['a', 'b', 'c'])
      })

      it('пустой массив тегов — допустим', async () => {
        await importPayload([validTx({ tags: [] })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
      })
    })

    describe('поле date', () => {
      it.each([
        ['отсутствует', () => {
          const o = validTx()
          delete o.date
          return o
        }],
        ['null', () => validTx({ date: null })],
        ['строка ISO', () => validTx({ date: '2024-01-01' })],
        ['boolean', () => validTx({ date: true })],
        ['массив', () => validTx({ date: [] })],
      ])('%s', async (_label, makeTx) => {
        await importPayload([makeTx()])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it('timestamp 0 — допустим', async () => {
        await importPayload([validTx({ date: 0 })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
      })
    })

    describe('позиция ошибки в массиве', () => {
      it('первая транзакция невалидна — позиция 1', async () => {
        await importPayload([
          { description: 1, amount: 1, category: 'A', rate: 'ok', tags: [], date: 1 },
          validTx(),
        ])
        expect(document.getElementById('import-status').textContent).toEqual(
          expect.stringMatching(/^Ошибка: некорректная транзакция в позиции 1 — /),
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })

      it('третья транзакция невалидна — позиция 3 с указанием поля', async () => {
        await importPayload([validTx(), validTx(), validTx({ amount: 'x' })])
        expect(document.getElementById('import-status').textContent).toBe(
          'Ошибка: некорректная транзакция в позиции 3 — поле "amount" должно быть числом (получено: string)',
        )
        expect(db.bulkAddTransactions).not.toHaveBeenCalled()
      })
    })

    describe('дополнительные поля и форматы', () => {
      it('поле id и прочие поля не ломают валидацию', async () => {
        await importPayload([validTx({ id: 999, extra: { nested: true } })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
        const [txs] = db.bulkAddTransactions.mock.calls[0]
        expect(txs[0].id).toBe(999)
        expect(txs[0].extra).toEqual({ nested: true })
      })

      it('{ transactions: [...] } с пустым массивом — успех', async () => {
        await importPayload({ transactions: [] })
        expect(db.bulkAddTransactions).toHaveBeenCalledWith([], expect.any(Function))
        expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
      })

      it('Unicode в description — успех', async () => {
        await importPayload([validTx({ description: 'Кофе ☕' })])
        expect(db.bulkAddTransactions).toHaveBeenCalled()
      })
    })

    describe('импорт settings', () => {
      it('settings отсутствует — localStorage не изменяется, импорт успешен', async () => {
        await importPayload({ transactions: [] })
        expect(localStorage.defaultTag).toBeUndefined()
        expect(localStorage.defaultRate).toBeUndefined()
        expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
      })

      it('settings с defaultTag сохраняет тег в localStorage и обновляет UI', async () => {
        await importPayload({ transactions: [], settings: { defaultTag: 'work' } })
        expect(localStorage.defaultTag).toBe('work')
        expect(document.getElementById('default-tag-input').value).toBe('work')
        const opt = document.querySelector('#transactions-limit option[value="default-tag"]')
        expect(opt).not.toBeNull()
        expect(opt.textContent).toBe('work')
      })

      it('settings с пустым defaultTag убирает опцию default-tag из #transactions-limit', async () => {
        const limitSelect = document.getElementById('transactions-limit')
        const opt = document.createElement('option')
        opt.value = 'default-tag'
        opt.textContent = 'old'
        limitSelect.insertBefore(opt, limitSelect.querySelector('option[value="custom"]'))
        await importPayload({ transactions: [], settings: { defaultTag: '' } })
        expect(document.querySelector('#transactions-limit option[value="default-tag"]')).toBeNull()
      })

      it('settings с пустым defaultTag при активном default-tag сбрасывает лимит на all', async () => {
        const limitSelect = document.getElementById('transactions-limit')
        const opt = document.createElement('option')
        opt.value = 'default-tag'
        opt.textContent = 'old'
        limitSelect.insertBefore(opt, limitSelect.querySelector('option[value="custom"]'))
        limitSelect.value = 'default-tag'
        await importPayload({ transactions: [], settings: { defaultTag: '' } })
        expect(limitSelect.value).toBe('all')
      })

      it('settings с defaultRate сохраняет rate в localStorage и обновляет #default-rate-select', async () => {
        await importPayload({ transactions: [], settings: { defaultRate: 'good' } })
        expect(localStorage.defaultRate).toBe('good')
        expect(document.getElementById('default-rate-select').value).toBe('good')
      })

      it('settings с defaultRate="" игнорируется', async () => {
        localStorage.defaultRate = 'waste'
        await importPayload({ transactions: [], settings: { defaultRate: '' } })
        expect(localStorage.defaultRate).toBe('waste')
      })

      it('settings с theme="dark" сохраняет тему, ставит data-theme и обновляет #theme-select', async () => {
        await importPayload({ transactions: [], settings: { theme: 'dark' } })
        expect(localStorage.theme).toBe('dark')
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
        expect(document.getElementById('theme-select').value).toBe('dark')
      })

      it('settings с theme="light" ставит data-theme="light" и обновляет #theme-select', async () => {
        await importPayload({ transactions: [], settings: { theme: 'light' } })
        expect(document.documentElement.getAttribute('data-theme')).toBe('light')
        expect(document.getElementById('theme-select').value).toBe('light')
      })

      it('settings с theme="system" убирает data-theme с html и обновляет #theme-select', async () => {
        document.documentElement.setAttribute('data-theme', 'dark')
        await importPayload({ transactions: [], settings: { theme: 'system' } })
        expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
        expect(document.getElementById('theme-select').value).toBe('system')
      })

      it('settings с неизвестным theme игнорируется', async () => {
        document.documentElement.setAttribute('data-theme', 'dark')
        await importPayload({ transactions: [], settings: { theme: 'custom' } })
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      })

      it('settings с неизвестным defaultRate игнорируется', async () => {
        await importPayload({ transactions: [], settings: { defaultRate: 'unknown' } })
        expect(localStorage.defaultRate).toBeUndefined()
      })

      it('settings с defaultTag не строкой игнорируется', async () => {
        await importPayload({ transactions: [], settings: { defaultTag: 123 } })
        expect(localStorage.defaultTag).toBeUndefined()
      })

      it('settings не объект — игнорируется, импорт не прерывается', async () => {
        await importPayload({ transactions: [], settings: 'invalid' })
        expect(db.bulkAddTransactions).toHaveBeenCalled()
        expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
      })

      it('settings массив — игнорируется, импорт не прерывается', async () => {
        await importPayload({ transactions: [], settings: ['dark'] })
        expect(db.bulkAddTransactions).toHaveBeenCalled()
      })

      it('все три поля settings применяются вместе', async () => {
        await importPayload({
          transactions: [],
          settings: { defaultTag: 'home', defaultRate: 'waste', theme: 'dark' },
        })
        expect(localStorage.defaultTag).toBe('home')
        expect(localStorage.defaultRate).toBe('waste')
        expect(localStorage.theme).toBe('dark')
      })
    })

    describe('текст причины ошибки', () => {
      const validTx2 = (overrides = {}) => ({
        description: 'X',
        amount: 1,
        category: 'Cat',
        rate: 'ok',
        tags: [],
        date: 1000,
        ...overrides,
      })

      const expectMsg = (msg) => {
        expect(document.getElementById('import-status').textContent).toBe(
          `Ошибка: некорректная транзакция в позиции 1 — ${msg}`,
        )
      }

      it('сам элемент null', async () => {
        await importPayload([null])
        expectMsg('ожидался объект, получен null')
      })

      it('сам элемент массив', async () => {
        await importPayload([[]])
        expectMsg('ожидался объект, получен array')
      })

      it('сам элемент число', async () => {
        await importPayload([42])
        expectMsg('ожидался объект, получен number')
      })

      it('description отсутствует', async () => {
        const tx = validTx2()
        delete tx.description
        await importPayload([tx])
        expectMsg('отсутствует поле "description"')
      })

      it('description = null', async () => {
        await importPayload([validTx2({ description: null })])
        expectMsg('поле "description" должно быть строкой (получено: null)')
      })

      it('description = число', async () => {
        await importPayload([validTx2({ description: 1 })])
        expectMsg('поле "description" должно быть строкой (получено: number)')
      })

      it('amount отсутствует', async () => {
        const tx = validTx2()
        delete tx.amount
        await importPayload([tx])
        expectMsg('отсутствует поле "amount"')
      })

      it('amount = NaN (как Infinity)', async () => {
        await importPayload([validTx2({ amount: 'NaN' })])
        expectMsg('поле "amount" должно быть числом (получено: string)')
      })

      it('amount = null', async () => {
        await importPayload([validTx2({ amount: null })])
        expectMsg('поле "amount" должно быть числом (получено: null)')
      })

      it('category отсутствует', async () => {
        const tx = validTx2()
        delete tx.category
        await importPayload([tx])
        expectMsg('отсутствует поле "category"')
      })

      it('category = массив', async () => {
        await importPayload([validTx2({ category: [] })])
        expectMsg('поле "category" должно быть строкой (получено: array)')
      })

      it('rate отсутствует', async () => {
        const tx = validTx2()
        delete tx.rate
        await importPayload([tx])
        expectMsg('отсутствует поле "rate"')
      })

      it('rate = неизвестная строка', async () => {
        await importPayload([validTx2({ rate: 'best' })])
        expectMsg('поле "rate" должно быть одним из "waste", "ok", "good" (получено: "best")')
      })

      it('rate = число', async () => {
        await importPayload([validTx2({ rate: 1 })])
        expectMsg('поле "rate" должно быть одним из "waste", "ok", "good" (получено: 1)')
      })

      it('tags отсутствует', async () => {
        const tx = validTx2()
        delete tx.tags
        await importPayload([tx])
        expectMsg('отсутствует поле "tags"')
      })

      it('tags = строка', async () => {
        await importPayload([validTx2({ tags: 'a,b' })])
        expectMsg('поле "tags" должно быть массивом (получено: string)')
      })

      it('tags = объект', async () => {
        await importPayload([validTx2({ tags: {} })])
        expectMsg('поле "tags" должно быть массивом (получено: object)')
      })

      it('tags содержит число — указывает индекс плохого элемента', async () => {
        await importPayload([validTx2({ tags: ['ok', 1, 'next'] })])
        expectMsg('элемент "tags[1]" должен быть строкой (получено: number)')
      })

      it('tags содержит null — указывает индекс плохого элемента', async () => {
        await importPayload([validTx2({ tags: [null] })])
        expectMsg('элемент "tags[0]" должен быть строкой (получено: null)')
      })

      it('date отсутствует', async () => {
        const tx = validTx2()
        delete tx.date
        await importPayload([tx])
        expectMsg('отсутствует поле "date"')
      })

      it('date = строка', async () => {
        await importPayload([validTx2({ date: '2024-01-01' })])
        expectMsg('поле "date" должно быть числом (получено: string)')
      })

      it('date = массив', async () => {
        await importPayload([validTx2({ date: [] })])
        expectMsg('поле "date" должно быть числом (получено: array)')
      })

      it('фиксирует первое нарушенное правило (description, а не date)', async () => {
        await importPayload([{ description: 1, amount: 1, category: 'A', rate: 'ok', tags: [], date: 1 }])
        expectMsg('поле "description" должно быть строкой (получено: number)')
      })

      it('класс error добавлен при детальной ошибке', async () => {
        await importPayload([validTx2({ amount: null })])
        expect(document.getElementById('import-status').classList.contains('error')).toBe(true)
      })
    })
  })
})

describe('ImportExport — обработчик выбора файла', () => {
  it('при выборе файла отображает имя и добавляет класс has-file', () => {
    const file = new File(['{}'], 'data.json', { type: 'application/json' })
    Object.defineProperty(document.getElementById('input-json'), 'files', {
      value: [file],
      configurable: true,
    })
    document.getElementById('input-json').dispatchEvent(new Event('change'))
    expect(document.getElementById('file-name-display').textContent).toBe('data.json')
    expect(document.getElementById('file-upload-zone').classList.contains('has-file')).toBe(true)
  })

  it('если файл не выбран — очищает отображение и убирает класс has-file', () => {
    const display = document.getElementById('file-name-display')
    const zone = document.getElementById('file-upload-zone')
    display.textContent = 'old.json'
    zone.classList.add('has-file')
    Object.defineProperty(document.getElementById('input-json'), 'files', {
      value: [],
      configurable: true,
    })
    document.getElementById('input-json').dispatchEvent(new Event('change'))
    expect(display.textContent).toBe('')
    expect(zone.classList.contains('has-file')).toBe(false)
  })
})
