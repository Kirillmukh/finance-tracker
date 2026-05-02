import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImportExport } from '../js/import-export.js'

// Контент который вернёт FileReader в текущем тесте
let fileReaderContent = '[]'

// Синхронный мок FileReader — вызывает onload через микрозадачу
class MockFileReader {
  readAsText(_file) {
    queueMicrotask(() => {
      if (this.onload) {
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
  setupDOM()
  vi.clearAllMocks()
  fileReaderContent = '[]'
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

  it('не вызывает bulkAdd если JSON не является массивом', async () => {
    setFile()
    fileReaderContent = JSON.stringify({ invalid: true })
    ie.importData()
    await new Promise((r) => setTimeout(r, 0))
    expect(db.bulkAddTransactions).not.toHaveBeenCalled()
  })
})
