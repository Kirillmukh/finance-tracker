import { describe, it, expect } from 'vitest'
import {
  RATES,
  countMapInc,
  countMapDec,
  formatDate,
  getDateRange,
  groupTransactions,
  capitalize,
  unionStart,
} from '../js/utils.js'

describe('RATES', () => {
  it('содержит ключи waste, ok, good', () => {
    expect(RATES.has('waste')).toBe(true)
    expect(RATES.has('ok')).toBe(true)
    expect(RATES.has('good')).toBe(true)
  })

  it('каждый тип имеет метку и цвет', () => {
    RATES.forEach((value) => {
      expect(Array.isArray(value)).toBe(true)
      expect(value).toHaveLength(2)
      expect(typeof value[0]).toBe('string') // метка
      expect(typeof value[1]).toBe('string') // цвет
    })
  })
})

describe('countMapInc', () => {
  it('создаёт новую запись со счётчиком 1', () => {
    const map = new Map()
    countMapInc(map, 'food')
    expect(map.get('food')).toBe(1)
  })

  it('увеличивает существующий счётчик', () => {
    const map = new Map([['food', 3]])
    countMapInc(map, 'food')
    expect(map.get('food')).toBe(4)
  })

  it('не затрагивает другие ключи', () => {
    const map = new Map([['food', 1], ['transport', 5]])
    countMapInc(map, 'food')
    expect(map.get('transport')).toBe(5)
  })
})

describe('countMapDec', () => {
  it('уменьшает счётчик больше 1', () => {
    const map = new Map([['food', 3]])
    countMapDec(map, 'food')
    expect(map.get('food')).toBe(2)
  })

  it('удаляет ключ когда счётчик равен 1', () => {
    const map = new Map([['food', 1]])
    countMapDec(map, 'food')
    expect(map.has('food')).toBe(false)
  })

  it('не падает при отсутствующем ключе', () => {
    const map = new Map()
    expect(() => countMapDec(map, 'missing')).not.toThrow()
  })
})

describe('formatDate', () => {
  it('возвращает ДД.ММ.ГГГГ без флага day', () => {
    const date = new Date(2024, 0, 5) // 5 янв 2024
    expect(formatDate(date)).toBe('05.01.2024')
  })

  it('возвращает ДД.ММ ЧЧ:ММ с флагом day=true', () => {
    const date = new Date(2024, 2, 15, 9, 3) // 15 мар 2024, 09:03
    expect(formatDate(date, true)).toBe('15.03 09:03')
  })

  it('добавляет ведущий ноль к дням и месяцам', () => {
    const date = new Date(2024, 0, 1) // 1 янв 2024
    expect(formatDate(date)).toBe('01.01.2024')
  })

  it('добавляет ведущий ноль к часам и минутам', () => {
    const date = new Date(2024, 0, 1, 5, 7) // 05:07
    expect(formatDate(date, true)).toBe('01.01 05:07')
  })

  it('корректно форматирует двузначные значения', () => {
    const date = new Date(2024, 11, 31, 23, 59) // 31 дек 2024, 23:59
    expect(formatDate(date)).toBe('31.12.2024')
    expect(formatDate(date, true)).toBe('31.12 23:59')
  })
})

describe('getDateRange', () => {
  it('day: начало и конец текущего дня', () => {
    const now = new Date(2024, 3, 10, 15, 30, 0)
    const { start, end } = getDateRange('day', now)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
    expect(start.getDate()).toBe(10)
    expect(end.getDate()).toBe(10)
  })

  it('week: от понедельника до воскресенья', () => {
    const wednesday = new Date(2024, 3, 10) // среда
    const { start, end } = getDateRange('week', wednesday)
    expect(start.getDay()).toBe(1) // понедельник
    expect(end.getDay()).toBe(0) // воскресенье
    expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000)
  })

  it('week: воскресенье переходит на прошлый понедельник', () => {
    const sunday = new Date(2024, 3, 7) // воскресенье
    const { start } = getDateRange('week', sunday)
    expect(start.getDay()).toBe(1)
  })

  it('month: с первого по последний день месяца', () => {
    const date = new Date(2024, 1, 15) // февраль 2024
    const { start, end } = getDateRange('month', date)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(1)
    expect(end.getMonth()).toBe(1)
    expect(end.getDate()).toBe(29) // 2024 — високосный год
    expect(end.getHours()).toBe(23)
  })

  it('year: с 1 января по 31 декабря', () => {
    const date = new Date(2024, 5, 15)
    const { start, end } = getDateRange('year', date)
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(11)
    expect(end.getDate()).toBe(31)
    expect(end.getHours()).toBe(23)
  })

  it('custom: парсит произвольные начало и конец', () => {
    const { start, end } = getDateRange('custom', new Date(), '2024-03-01', '2024-03-31')
    expect(start.getFullYear()).toBe(2024)
    expect(start.getMonth()).toBe(2)
    expect(start.getDate()).toBe(1)
    expect(end.getFullYear()).toBe(2024)
    expect(end.getMonth()).toBe(2)
    expect(end.getDate()).toBe(31)
    expect(end.getHours()).toBe(23)
  })

  it('custom без параметров не меняет start и end', () => {
    const now = new Date(2024, 3, 10)
    const { start, end } = getDateRange('custom', now)
    expect(start.getTime()).toBe(now.getTime())
    expect(end.getTime()).toBe(now.getTime())
  })
})

describe('groupTransactions', () => {
  const txs = [
    { description: 'A', amount: 100, category: 'Food', rate: 'ok', tags: ['lunch', 'cafe'] },
    { description: 'B', amount: 200, category: 'Food', rate: 'waste', tags: ['dinner'] },
    { description: 'C', amount: 50, category: 'Transport', rate: 'ok', tags: [] },
  ]

  it('группирует по категории', () => {
    const result = groupTransactions(txs, 'category')
    expect(result['Food']).toBe(300)
    expect(result['Transport']).toBe(50)
  })

  it('группирует по рейтингу', () => {
    const result = groupTransactions(txs, 'rate')
    expect(result['ok']).toBe(150)
    expect(result['waste']).toBe(200)
  })

  it('группирует по тегам', () => {
    const result = groupTransactions(txs, 'tags')
    expect(result['lunch']).toBe(100)
    expect(result['cafe']).toBe(100)
    expect(result['dinner']).toBe(200)
    expect(result['Transport']).toBeUndefined()
  })

  it('не включает транзакции без тегов в результат', () => {
    const result = groupTransactions(txs, 'tags')
    const keys = Object.keys(result)
    expect(keys).not.toContain(undefined)
    expect(keys).not.toContain('')
  })

  it('возвращает пустой объект для пустого массива', () => {
    expect(groupTransactions([], 'category')).toEqual({})
  })
})

describe('capitalize', () => {
  it('делает первую букву заглавной, остальные строчными', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('приводит верхний регистр к смешанному', () => {
    expect(capitalize('HELLO')).toBe('Hello')
  })

  it('возвращает пустую строку для пустого ввода', () => {
    expect(capitalize('')).toBe('')
    expect(capitalize(null)).toBe('')
    expect(capitalize(undefined)).toBe('')
  })

  it('обрабатывает одиночный символ', () => {
    expect(capitalize('a')).toBe('A')
  })
})

describe('unionStart', () => {
  it('возвращает длину совпавшего префикса', () => {
    expect(unionStart('Gr', 'Grocery')).toBe(2)
    expect(unionStart('foo', 'foobar')).toBe(3)
  })

  it('возвращает -1 при несовпадении', () => {
    expect(unionStart('Foo', 'Grocery')).toBe(-1)
    expect(unionStart('abc', 'xyz')).toBe(-1)
  })

  it('возвращает -1 для пустого ввода', () => {
    expect(unionStart('', 'Grocery')).toBe(-1)
  })

  it('возвращает -1 если ввод равен src', () => {
    expect(unionStart('Grocery', 'Grocery')).toBe(-1)
  })

  it('возвращает -1 если ввод длиннее src', () => {
    expect(unionStart('GroceryShop', 'Grocery')).toBe(-1)
  })

  it('чувствителен к регистру', () => {
    expect(unionStart('gr', 'Grocery')).toBe(-1)
    expect(unionStart('Gr', 'Grocery')).toBe(2)
  })
})
