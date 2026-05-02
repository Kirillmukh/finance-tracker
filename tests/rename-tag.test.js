import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupRenameTagUI } from '../js/rename-tag.js'

const allTags = new Map([['lunch', 2], ['cafe', 1], ['dinner', 1]])

function setupDOM() {
  document.body.innerHTML = `
    <input type="text" id="rename-tag-from" />
    <div id="rename-tag-from-suggestion" style="display:none"></div>
    <div id="rename-tag-stats" style="display:none"></div>
    <input type="text" id="rename-tag-to" />
    <div id="rename-tag-warning" style="display:none"></div>
    <button id="rename-tag-btn">Переименовать</button>
    <p id="rename-tag-status"></p>
  `
}

function makeManager(statsCount = 3, statsTotal = 450) {
  return {
    getTagStats: vi.fn((_tag, cb) => cb(statsCount, statsTotal)),
    renameTag: vi.fn((_old, _new, cb) => cb && cb()),
  }
}

beforeEach(() => {
  setupDOM()
  vi.clearAllMocks()
})

describe('setupRenameTagUI — автокомплит первого поля', () => {
  it('показывает подсказку при вводе совпадающего префикса', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lu'
    input.dispatchEvent(new Event('input'))
    const suggestion = document.getElementById('rename-tag-from-suggestion')
    expect(suggestion.style.display).toBe('block')
    expect(suggestion.textContent).toBe('lunch')
  })

  it('скрывает подсказку если совпадений нет', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    const suggestion = document.getElementById('rename-tag-from-suggestion')
    suggestion.style.display = 'block'
    input.value = 'xyz'
    input.dispatchEvent(new Event('input'))
    expect(suggestion.style.display).toBe('none')
  })

  it('скрывает подсказку для пустого ввода', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    const suggestion = document.getElementById('rename-tag-from-suggestion')
    input.value = 'lu'
    input.dispatchEvent(new Event('input'))
    input.value = ''
    input.dispatchEvent(new Event('input'))
    expect(suggestion.style.display).toBe('none')
  })

  it('не показывает подсказку при вводе полного совпадения (тег уже введён)', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lunch'
    input.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-from-suggestion').style.display).toBe('none')
  })

  it('клик по подсказке заполняет поле текстом подсказки', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lu'
    input.dispatchEvent(new Event('input'))
    document.getElementById('rename-tag-from-suggestion').click()
    expect(input.value).toBe('lunch')
  })

  it('клик по подсказке скрывает её', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lu'
    input.dispatchEvent(new Event('input'))
    document.getElementById('rename-tag-from-suggestion').click()
    expect(document.getElementById('rename-tag-from-suggestion').style.display).toBe('none')
  })

  it('двойной пробел принимает подсказку и заполняет поле', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lu  '
    input.dispatchEvent(new Event('input'))
    expect(input.value).toBe('lunch')
  })
})

describe('setupRenameTagUI — статистика тега', () => {
  it('статистика скрыта по умолчанию', () => {
    setupRenameTagUI(makeManager(), allTags)
    expect(document.getElementById('rename-tag-stats').style.display).toBe('none')
  })

  it('статистика скрыта при вводе несуществующего тега', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'xyz'
    input.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-stats').style.display).toBe('none')
  })

  it('статистика скрыта при пустом вводе', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lunch'
    input.dispatchEvent(new Event('input'))
    input.value = ''
    input.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-stats').style.display).toBe('none')
  })

  it('статистика появляется при вводе существующего тега', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lunch'
    input.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-stats').style.display).toBe('block')
  })

  it('вызывает getTagStats с обрезанным значением поля', () => {
    const mgr = makeManager()
    setupRenameTagUI(mgr, allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lunch'
    input.dispatchEvent(new Event('input'))
    expect(mgr.getTagStats).toHaveBeenCalledWith('lunch', expect.any(Function))
  })

  it('показывает количество и сумму из getTagStats', () => {
    setupRenameTagUI(makeManager(7, 980), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lunch'
    input.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-stats').textContent).toBe('7 транзакций • сумма: 980 ₽')
  })

  it('статистика появляется после клика на подсказку', () => {
    const mgr = makeManager()
    setupRenameTagUI(mgr, allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lu'
    input.dispatchEvent(new Event('input'))
    document.getElementById('rename-tag-from-suggestion').click()
    expect(document.getElementById('rename-tag-stats').style.display).toBe('block')
  })

  it('статистика появляется после принятия подсказки двойным пробелом', () => {
    setupRenameTagUI(makeManager(), allTags)
    const input = document.getElementById('rename-tag-from')
    input.value = 'lu  '
    input.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-stats').style.display).toBe('block')
  })
})

describe('setupRenameTagUI — предупреждение о существующем теге', () => {
  it('предупреждение скрыто по умолчанию', () => {
    setupRenameTagUI(makeManager(), allTags)
    expect(document.getElementById('rename-tag-warning').style.display).toBe('none')
  })

  it('предупреждение появляется если новый тег уже существует', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    const toInput = document.getElementById('rename-tag-to')
    toInput.value = 'cafe'
    toInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-warning').style.display).toBe('block')
  })

  it('текст предупреждения содержит название нового тега', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    const toInput = document.getElementById('rename-tag-to')
    toInput.value = 'cafe'
    toInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-warning').textContent).toContain('cafe')
  })

  it('предупреждение скрыто если новый тег не существует', () => {
    setupRenameTagUI(makeManager(), allTags)
    const toInput = document.getElementById('rename-tag-to')
    toInput.value = 'новый'
    toInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-warning').style.display).toBe('none')
  })

  it('предупреждение скрыто если новый тег совпадает со старым', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    const toInput = document.getElementById('rename-tag-to')
    toInput.value = 'lunch'
    toInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-warning').style.display).toBe('none')
  })

  it('предупреждение скрыто если второе поле пустое', () => {
    setupRenameTagUI(makeManager(), allTags)
    const toInput = document.getElementById('rename-tag-to')
    toInput.value = ''
    toInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('rename-tag-warning').style.display).toBe('none')
  })
})

describe('setupRenameTagUI — кнопка "Переименовать"', () => {
  it('показывает ошибку если первое поле пустое', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-to').value = 'новый'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-status').textContent).toBe('Заполните оба поля')
  })

  it('показывает ошибку если второе поле пустое', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-status').textContent).toBe('Заполните оба поля')
  })

  it('показывает ошибку если тег из первого поля не найден в allTags', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'нет'
    document.getElementById('rename-tag-to').value = 'новый'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-status').textContent).toContain('не найден')
  })

  it('вызывает renameTag с корректными аргументами', () => {
    const mgr = makeManager()
    setupRenameTagUI(mgr, allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = 'brunch'
    document.getElementById('rename-tag-btn').click()
    expect(mgr.renameTag).toHaveBeenCalledWith('lunch', 'brunch', expect.any(Function))
  })

  it('передаёт новое имя тега без обрезки пробелов в начале', () => {
    const mgr = makeManager()
    setupRenameTagUI(mgr, allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = ' brunch'
    document.getElementById('rename-tag-btn').click()
    expect(mgr.renameTag).toHaveBeenCalledWith('lunch', ' brunch', expect.any(Function))
  })

  it('очищает оба поля после переименования', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = 'brunch'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-from').value).toBe('')
    expect(document.getElementById('rename-tag-to').value).toBe('')
  })

  it('скрывает статистику после переименования', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-stats').style.display = 'block'
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = 'brunch'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-stats').style.display).toBe('none')
  })

  it('скрывает предупреждение после переименования', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-warning').style.display = 'block'
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = 'brunch'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-warning').style.display).toBe('none')
  })

  it('скрывает подсказку после переименования', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from-suggestion').style.display = 'block'
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = 'brunch'
    document.getElementById('rename-tag-btn').click()
    expect(document.getElementById('rename-tag-from-suggestion').style.display).toBe('none')
  })

  it('показывает сообщение об успехе с именами старого и нового тегов', () => {
    setupRenameTagUI(makeManager(), allTags)
    document.getElementById('rename-tag-from').value = 'lunch'
    document.getElementById('rename-tag-to').value = 'brunch'
    document.getElementById('rename-tag-btn').click()
    const status = document.getElementById('rename-tag-status').textContent
    expect(status).toContain('lunch')
    expect(status).toContain('brunch')
  })

  it('не вызывает renameTag при ошибке валидации', () => {
    const mgr = makeManager()
    setupRenameTagUI(mgr, allTags)
    document.getElementById('rename-tag-btn').click()
    expect(mgr.renameTag).not.toHaveBeenCalled()
  })
})
