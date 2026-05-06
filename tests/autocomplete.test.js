import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { suggestAutocomplete, applySuggestion, setupAutocomplete } from '../js/autocomplete.js'

describe('suggestAutocomplete', () => {
  it('возвращает совпадение по префиксу', () => {
    const map = new Map([['Grocery', 5], ['Sport', 3]])
    expect(suggestAutocomplete(map, 'Gr')).toBe('Grocery')
  })

  it('совпадение нечувствительно к регистру', () => {
    const map = new Map([['Grocery', 5]])
    expect(suggestAutocomplete(map, 'gr')).toBe('Grocery')
    expect(suggestAutocomplete(map, 'GR')).toBe('Grocery')
  })

  it('при равной длине префикса выбирает более весомый вариант', () => {
    const map = new Map([['Grocery', 10], ['Grapes', 15]])
    const result = suggestAutocomplete(map, 'gr')
    expect(result).toBe('Grapes')
  })

  it('возвращает вариант с более длинным совпавшим префиксом', () => {
    const map = new Map([['Gro', 20], ['Grocery', 5]])
    // "Grocery" совпадает на 3 символа ("gro"), "Gro" — тоже 3, но "Gro".length === inputText.length+3
    // На самом деле unionStart("gro", "gro") = -1 (равные длины), а unionStart("gro", "grocery") = 3
    // Поэтому "Grocery" должен выиграть
    const result = suggestAutocomplete(map, 'gro')
    expect(result).toBe('Grocery')
  })

  it('исключает элементы из excludeList', () => {
    const map = new Map([['Grocery', 10], ['Grapes', 5]])
    const result = suggestAutocomplete(map, 'Gr', ['Grocery'])
    expect(result).toBe('Grapes')
  })

  it('возвращает null если нет совпадений', () => {
    const map = new Map([['Grocery', 5]])
    expect(suggestAutocomplete(map, 'xyz')).toBeNull()
  })

  it('возвращает null для пустого ввода', () => {
    const map = new Map([['Grocery', 5]])
    expect(suggestAutocomplete(map, '')).toBeNull()
  })

  it('возвращает null для ввода из пробелов', () => {
    const map = new Map([['Grocery', 5]])
    expect(suggestAutocomplete(map, '   ')).toBeNull()
  })

  it('возвращает null для пустой карты', () => {
    expect(suggestAutocomplete(new Map(), 'gr')).toBeNull()
  })

  it('возвращает null если все варианты исключены', () => {
    const map = new Map([['Grocery', 10]])
    expect(suggestAutocomplete(map, 'Gr', ['Grocery'])).toBeNull()
  })

  it('не предлагает полное совпадение (ввод равен ключу)', () => {
    const map = new Map([['Grocery', 10]])
    // unionStart("Grocery", "Grocery") === -1, значит совпадения нет
    expect(suggestAutocomplete(map, 'Grocery')).toBeNull()
  })
})

describe('applySuggestion', () => {
  it('устанавливает значение поля и скрывает подсказку', () => {
    const input = document.createElement('input')
    const div = document.createElement('div')
    div.style.display = 'block'
    applySuggestion(input, div, 'Grocery')
    expect(input.value).toBe('Grocery')
    expect(div.style.display).toBe('none')
  })
})

describe('setupAutocomplete', () => {
  let input, div

  beforeEach(() => {
    input = document.createElement('input')
    div = document.createElement('div')
    div.style.display = 'none'
    document.body.appendChild(input)
    document.body.appendChild(div)
  })

  afterEach(() => {
    input.remove()
    div.remove()
  })

  it('клик по блоку подсказки применяет результат getSuggestion', () => {
    const getSuggestion = vi.fn(() => 'Grocery')
    setupAutocomplete(input, div, new Map([['Grocery', 5]]), getSuggestion)
    div.click()
    expect(getSuggestion).toHaveBeenCalled()
    expect(input.value).toBe('Grocery')
    expect(div.style.display).toBe('none')
  })

  it('ввод совпадающего текста показывает подсказку', () => {
    setupAutocomplete(input, div, new Map([['Grocery', 5]]), () => '')
    input.value = 'Gr'
    input.dispatchEvent(new Event('input'))
    expect(div.style.display).toBe('block')
    expect(div.textContent).toBe('Grocery')
  })

  it('ввод несовпадающего текста скрывает подсказку', () => {
    setupAutocomplete(input, div, new Map([['Grocery', 5]]), () => '')
    div.style.display = 'block'
    input.value = 'xyz'
    input.dispatchEvent(new Event('input'))
    expect(div.style.display).toBe('none')
  })

  it('двойной пробел применяет подсказку автоматически', () => {
    setupAutocomplete(input, div, new Map([['Grocery', 5]]), () => '')
    input.value = 'Gr  '
    input.dispatchEvent(new Event('input'))
    expect(input.value).toBe('Grocery')
    expect(div.style.display).toBe('none')
  })

  it('excludeList исключает вариант из подсказок', () => {
    const map = new Map([['Grocery', 10], ['Grapes', 3]])
    setupAutocomplete(input, div, map, () => '', ['Grocery'])
    input.value = 'Gr'
    input.dispatchEvent(new Event('input'))
    expect(div.textContent).toBe('Grapes')
  })
})
