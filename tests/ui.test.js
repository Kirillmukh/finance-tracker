import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UI } from '../js/ui.js'

function setupDOM() {
  document.body.innerHTML = `
    <div id="tags-container"></div>
    <input id="tag-input" />
    <div id="tag-suggestion" style="display: none"></div>
    <button id="add-tag">+</button>
    <input id="category-input" />
    <div id="category-suggestion" style="display: none"></div>
  `
}

let ui

beforeEach(() => {
  setupDOM()
  ui = new UI(null) // modal не нужен для базовых операций
})

describe('UI — состояние тегов', () => {
  it('getTags изначально возвращает пустой массив', () => {
    expect(ui.getTags()).toEqual([])
  })

  it('getTagsToRemove изначально возвращает пустой Set', () => {
    expect(ui.getTagsToRemove().size).toBe(0)
  })

  it('clearTags очищает массив тегов', () => {
    ui.tags.push('lunch', 'dinner')
    ui.clearTags()
    expect(ui.getTags()).toHaveLength(0)
  })

  it('clearTags не создаёт новый массив (мутирует существующий)', () => {
    const ref = ui.getTags()
    ui.tags.push('test')
    ui.clearTags()
    expect(ui.getTags()).toBe(ref)
    expect(ref).toHaveLength(0)
  })

  it('clearTagsToRemove очищает Set', () => {
    ui.tagsToRemove.add('old-tag')
    ui.clearTagsToRemove()
    expect(ui.getTagsToRemove().size).toBe(0)
  })
})

describe('UI.renderTags', () => {
  it('отображает теги как чипы', () => {
    ui.tags = ['lunch', 'cafe']
    ui.renderTags()
    const container = document.getElementById('tags-container')
    expect(container.innerHTML).toContain('lunch')
    expect(container.innerHTML).toContain('cafe')
  })

  it('каждый тег содержит кнопку удаления', () => {
    ui.tags = ['lunch']
    ui.renderTags()
    expect(document.querySelector('.remove-tag-btn')).not.toBeNull()
  })

  it('очищает контейнер если тегов нет', () => {
    ui.tags = ['lunch']
    ui.renderTags()
    ui.tags = []
    ui.renderTags()
    expect(document.getElementById('tags-container').innerHTML).toBe('')
  })
})

describe('UI.removeTag', () => {
  it('удаляет указанный тег из массива', () => {
    ui.tags = ['lunch', 'cafe', 'dinner']
    ui.removeTag('cafe')
    expect(ui.getTags()).not.toContain('cafe')
    expect(ui.getTags()).toContain('lunch')
    expect(ui.getTags()).toContain('dinner')
  })

  it('перерисовывает теги после удаления', () => {
    ui.tags = ['lunch', 'cafe']
    ui.removeTag('lunch')
    const container = document.getElementById('tags-container')
    expect(container.innerHTML).not.toContain('lunch')
    expect(container.innerHTML).toContain('cafe')
  })

  it('ничего не делает если тег не найден', () => {
    ui.tags = ['lunch']
    ui.removeTag('nonexistent')
    expect(ui.getTags()).toHaveLength(1)
  })
})

describe('UI.modalRemoveTag', () => {
  it('добавляет тег в tagsToRemove', () => {
    ui.modalRemoveTag('old-tag')
    expect(ui.getTagsToRemove().has('old-tag')).toBe(true)
  })

  it('добавляет несколько тегов', () => {
    ui.modalRemoveTag('tag1')
    ui.modalRemoveTag('tag2')
    expect(ui.getTagsToRemove().size).toBe(2)
  })
})

describe('UI.createTransactionModalContent', () => {
  const transaction = {
    description: 'Обед',
    amount: 500,
    category: 'Food',
    rate: 'ok',
    tags: ['lunch', 'cafe'],
    date: new Date(2024, 3, 10, 12, 30).getTime(),
  }

  it('содержит описание транзакции', () => {
    const html = ui.createTransactionModalContent(transaction)
    expect(html).toContain('Обед')
  })

  it('содержит сумму транзакции', () => {
    const html = ui.createTransactionModalContent(transaction)
    expect(html).toContain('500')
  })

  it('содержит категорию транзакции', () => {
    const html = ui.createTransactionModalContent(transaction)
    expect(html).toContain('Food')
  })

  it('содержит теги транзакции', () => {
    const html = ui.createTransactionModalContent(transaction)
    expect(html).toContain('lunch')
    expect(html).toContain('cafe')
  })

  it('содержит поля для ввода даты и времени', () => {
    const html = ui.createTransactionModalContent(transaction)
    expect(html).toContain('modal-date-input')
    expect(html).toContain('modal-time-input')
  })

  it('содержит кнопки сохранения, удаления и дублирования', () => {
    const html = ui.createTransactionModalContent(transaction)
    expect(html).toContain('modal-save-btn')
    expect(html).toContain('modal-delete-btn')
    expect(html).toContain('modal-duplicate-btn')
  })

  it('обрабатывает пустой массив тегов', () => {
    const html = ui.createTransactionModalContent({ ...transaction, tags: [] })
    expect(html).toContain('modal-tags-list')
  })
})

describe('UI.setupTagInput — взаимодействие пользователя', () => {
  it('при вводе совпадающего текста показывает подсказку', () => {
    const allTags = new Map([['lunch', 5], ['dinner', 3]])
    ui.setupTagInput(allTags)
    const tagInput = document.getElementById('tag-input')
    tagInput.value = 'lu'
    tagInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('tag-suggestion').style.display).toBe('block')
    expect(document.getElementById('tag-suggestion').textContent).toBe('lunch')
  })

  it('при вводе несовпадающего текста скрывает подсказку', () => {
    const allTags = new Map([['lunch', 5]])
    ui.setupTagInput(allTags)
    const tagInput = document.getElementById('tag-input')
    tagInput.value = 'xyz'
    tagInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('tag-suggestion').style.display).toBe('none')
  })

  it('клик по подсказке подставляет тег в поле ввода', () => {
    const allTags = new Map([['lunch', 5]])
    ui.setupTagInput(allTags)
    const tagInput = document.getElementById('tag-input')
    tagInput.value = 'lu'
    tagInput.dispatchEvent(new Event('input'))
    document.getElementById('tag-suggestion').click()
    expect(tagInput.value).toBe('lunch')
    expect(document.getElementById('tag-suggestion').style.display).toBe('none')
  })

  it('двойной пробел в конце ввода применяет подсказку', () => {
    const allTags = new Map([['lunch', 5]])
    ui.setupTagInput(allTags)
    const tagInput = document.getElementById('tag-input')
    tagInput.value = 'lu  '
    tagInput.dispatchEvent(new Event('input'))
    expect(tagInput.value).toBe('lunch')
  })

  it('клик по кнопке "+" добавляет тег в список', () => {
    ui.setupTagInput(new Map())
    const tagInput = document.getElementById('tag-input')
    tagInput.value = 'snack'
    document.getElementById('add-tag').click()
    expect(ui.getTags()).toContain('snack')
    expect(tagInput.value).toBe('')
  })

  it('добавление пустого ввода ничего не делает', () => {
    ui.setupTagInput(new Map())
    document.getElementById('tag-input').value = '   '
    document.getElementById('add-tag').click()
    expect(ui.getTags()).toHaveLength(0)
  })

  it('дублирующийся тег не добавляется повторно', () => {
    ui.setupTagInput(new Map())
    document.getElementById('tag-input').value = 'lunch'
    document.getElementById('add-tag').click()
    document.getElementById('tag-input').value = 'lunch'
    document.getElementById('add-tag').click()
    expect(ui.getTags()).toHaveLength(1)
  })

  it('тройной пробел в конце ввода автоматически добавляет тег', () => {
    ui.setupTagInput(new Map())
    const tagInput = document.getElementById('tag-input')
    tagInput.value = 'snack   '
    tagInput.dispatchEvent(new Event('input'))
    expect(ui.getTags()).toContain('snack')
  })
})

describe('UI.setupCategoryInput — взаимодействие пользователя', () => {
  it('при вводе совпадающего текста показывает подсказку', () => {
    const allCategories = new Map([['Food', 5], ['Transport', 2]])
    ui.setupCategoryInput(allCategories)
    const categoryInput = document.getElementById('category-input')
    categoryInput.value = 'Fo'
    categoryInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('category-suggestion').style.display).toBe('block')
    expect(document.getElementById('category-suggestion').textContent).toBe('Food')
  })

  it('при вводе несовпадающего текста скрывает подсказку', () => {
    const allCategories = new Map([['Food', 5]])
    ui.setupCategoryInput(allCategories)
    const categoryInput = document.getElementById('category-input')
    categoryInput.value = 'xyz'
    categoryInput.dispatchEvent(new Event('input'))
    expect(document.getElementById('category-suggestion').style.display).toBe('none')
  })

  it('клик по подсказке подставляет категорию в поле ввода', () => {
    const allCategories = new Map([['Food', 5]])
    ui.setupCategoryInput(allCategories)
    const categoryInput = document.getElementById('category-input')
    categoryInput.value = 'Fo'
    categoryInput.dispatchEvent(new Event('input'))
    document.getElementById('category-suggestion').click()
    expect(categoryInput.value).toBe('Food')
  })

  it('двойной пробел в конце ввода применяет подсказку', () => {
    const allCategories = new Map([['Food', 5]])
    ui.setupCategoryInput(allCategories)
    const categoryInput = document.getElementById('category-input')
    categoryInput.value = 'Fo  '
    categoryInput.dispatchEvent(new Event('input'))
    expect(categoryInput.value).toBe('Food')
  })
})

describe('UI.setupModalTagHandling — взаимодействие пользователя', () => {
  beforeEach(() => {
    document.body.insertAdjacentHTML('beforeend', `
      <input id="modal-tag-input" />
      <button id="modal-add-tag">+</button>
      <div id="modal-tags-list"></div>
    `)
  })

  it('клик по кнопке добавляет новый тег в список и в ui.tags', () => {
    const transaction = { tags: [] }
    ui.setupModalTagHandling(transaction)
    document.getElementById('modal-tag-input').value = 'breakfast'
    document.getElementById('modal-add-tag').click()
    expect(ui.getTags()).toContain('breakfast')
    expect(document.getElementById('modal-tags-list').innerHTML).toContain('breakfast')
  })

  it('не добавляет тег, уже присутствующий в транзакции', () => {
    const transaction = { tags: ['lunch'] }
    ui.setupModalTagHandling(transaction)
    document.getElementById('modal-tag-input').value = 'lunch'
    document.getElementById('modal-add-tag').click()
    expect(ui.getTags()).not.toContain('lunch')
  })

  it('не добавляет тег, уже добавленный ранее в эту же сессию', () => {
    const transaction = { tags: [] }
    ui.setupModalTagHandling(transaction)
    document.getElementById('modal-tag-input').value = 'snack'
    document.getElementById('modal-add-tag').click()
    document.getElementById('modal-tag-input').value = 'snack'
    document.getElementById('modal-add-tag').click()
    expect(ui.getTags().filter((t) => t === 'snack')).toHaveLength(1)
  })

  it('повторное добавление тега из tagsToRemove отменяет его удаление', () => {
    const transaction = { tags: ['lunch'] }
    ui.setupModalTagHandling(transaction)
    ui.tagsToRemove.add('lunch')
    document.getElementById('modal-tag-input').value = 'lunch'
    document.getElementById('modal-add-tag').click()
    expect(ui.getTagsToRemove().has('lunch')).toBe(false)
  })
})
