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
    <button id="import-btn">Импорт</button>
    <input id="input-json" type="file" />
    <div id="file-upload-zone"></div>
    <span id="file-name-display"></span>
    <div id="export-status"></div>
    <div id="import-status"></div>
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

function makeTransactionManager() {
  return {
    singleLoadTransactionsRender: vi.fn(),
    loadAllCategories: vi.fn(),
    loadAllTags: vi.fn(),
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

  it('экспортирует JSON в формате { transactions: [...] }', () => {
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
    expect(parsed).toEqual({ transactions: txs })
  })
})

describe('ImportExport.importData', () => {
  const validJSON = JSON.stringify([
    { description: 'Imported', amount: 300, category: 'Food', rate: 'ok', tags: [], date: 1000 },
  ])

  it('показывает сообщение если файл не выбран', () => {
    Object.defineProperty(document.getElementById('input-json'), 'files', {
      value: [],
      configurable: true,
    })
    ie.importData()
    expect(document.getElementById('import-status').textContent).toBe('Файл не выбран!')
  })

  it('устанавливает статус после запуска импорта', () => {
    setFile()
    fileReaderContent = validJSON
    ie.importData()
    expect(document.getElementById('import-status').textContent).toBe('Успешно импортировано!')
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
    expect(() => ie.importData()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })

  it('при ошибке FileReader не бросает исключение', async () => {
    setFile()
    fileReaderShouldError = true
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => ie.importData()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
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
