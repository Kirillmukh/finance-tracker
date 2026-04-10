import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import { Database } from '../js/db.js'

let db

// Вспомогательные обёртки для callback-based API
const dbAdd = (database, tx) =>
  new Promise((resolve) => database.addTransaction(tx, resolve))

const dbRead = (database) =>
  new Promise((resolve) => {
    let data
    database.readOnlyTransaction([(txs) => { data = txs }], () => resolve(data))
  })

const dbReadByDate = (database, range) =>
  new Promise((resolve) => {
    let data
    database.readOnlyTransactionByDate([(txs) => { data = txs }], range, () => resolve(data))
  })

const dbUpdate = (database, tx) =>
  new Promise((resolve) => database.updateTransaction(tx, resolve))

const dbDelete = (database, id) =>
  new Promise((resolve) => database.deleteTransaction(id, resolve))

const dbClear = (database) =>
  new Promise((resolve) => database.clearAllTransactions(resolve))

const dbBulkAdd = (database, txs) =>
  new Promise((resolve) => database.bulkAddTransactions(txs, resolve))

beforeEach(async () => {
  global.indexedDB = new IDBFactory()
  db = new Database()
  await db.init()
})

describe('Database.init', () => {
  it('инициализируется без ошибок', async () => {
    const db2 = new Database()
    await expect(db2.init()).resolves.toBeDefined()
  })

  it('после init db.db не null', () => {
    expect(db.db).not.toBeNull()
  })
})

describe('Database CRUD', () => {
  const sample = { description: 'Кофе', amount: 150, category: 'Food', rate: 'ok', tags: [], date: Date.now() }

  it('addTransaction + readOnlyTransaction: транзакция сохраняется и читается', async () => {
    await dbAdd(db, sample)
    const result = await dbRead(db)
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Кофе')
    expect(result[0].amount).toBe(150)
  })

  it('добавление нескольких транзакций', async () => {
    await dbAdd(db, { ...sample, description: 'A', date: 1000 })
    await dbAdd(db, { ...sample, description: 'B', date: 2000 })
    const result = await dbRead(db)
    expect(result).toHaveLength(2)
  })

  it('updateTransaction: обновляет поля записи', async () => {
    await dbAdd(db, sample)
    const [saved] = await dbRead(db)
    saved.amount = 999
    await dbUpdate(db, saved)
    const [updated] = await dbRead(db)
    expect(updated.amount).toBe(999)
  })

  it('deleteTransaction: удаляет запись по id', async () => {
    await dbAdd(db, sample)
    const [saved] = await dbRead(db)
    await dbDelete(db, saved.id)
    const result = await dbRead(db)
    expect(result).toHaveLength(0)
  })

  it('clearAllTransactions: удаляет все записи', async () => {
    await dbAdd(db, { ...sample, date: 1000 })
    await dbAdd(db, { ...sample, date: 2000 })
    await dbClear(db)
    const result = await dbRead(db)
    expect(result).toHaveLength(0)
  })

  it('bulkAddTransactions: добавляет несколько записей сразу', async () => {
    const txs = [
      { ...sample, description: 'X', date: 1000 },
      { ...sample, description: 'Y', date: 2000 },
      { ...sample, description: 'Z', date: 3000 },
    ]
    await dbBulkAdd(db, txs)
    const result = await dbRead(db)
    expect(result).toHaveLength(3)
  })
})

describe('Database.readOnlyTransactionByDate', () => {
  const base = { description: 'T', amount: 100, category: 'X', rate: 'ok', tags: [] }

  beforeEach(async () => {
    await dbAdd(db, { ...base, date: 1000 })
    await dbAdd(db, { ...base, date: 5000 })
    await dbAdd(db, { ...base, date: 9000 })
  })

  it('возвращает транзакции в диапазоне дат', async () => {
    const range = IDBKeyRange.bound(2000, 8000)
    const result = await dbReadByDate(db, range)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe(5000)
  })

  it('включает граничные значения', async () => {
    const range = IDBKeyRange.bound(1000, 9000)
    const result = await dbReadByDate(db, range)
    expect(result).toHaveLength(3)
  })

  it('возвращает пустой массив если диапазон не совпадает', async () => {
    const range = IDBKeyRange.bound(100, 500)
    const result = await dbReadByDate(db, range)
    expect(result).toHaveLength(0)
  })

  it('при не-IDBKeyRange запросе возвращает все транзакции', async () => {
    const result = await dbReadByDate(db, null)
    expect(result).toHaveLength(3)
  })
})
