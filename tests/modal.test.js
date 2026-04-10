import { describe, it, expect, beforeEach } from 'vitest'
import { Modal } from '../js/modal.js'

function setupDOM() {
  document.body.innerHTML = `
    <div id="modal">
      <button class="close-btn">×</button>
      <h2 id="modal-title"></h2>
      <div id="modal-body"></div>
    </div>
  `
}

let modal

beforeEach(() => {
  setupDOM()
  document.body.style.overflow = ''
  modal = new Modal()
})

describe('Modal.open', () => {
  it('добавляет класс show', () => {
    modal.open('заголовок', '<p>Контент</p>')
    expect(document.getElementById('modal').classList.contains('show')).toBe(true)
  })

  it('устанавливает заголовок с заглавной буквы', () => {
    modal.open('test title', '')
    expect(document.getElementById('modal-title').textContent).toBe('Test title')
  })

  it('устанавливает HTML содержимое', () => {
    modal.open('t', '<span id="test-span">hello</span>')
    expect(document.getElementById('test-span')).not.toBeNull()
  })

  it('скрывает скролл body', () => {
    modal.open('t', '')
    expect(document.body.style.overflow).toBe('hidden')
  })
})

describe('Modal.close', () => {
  beforeEach(() => modal.open('t', ''))

  it('убирает класс show', () => {
    modal.close()
    expect(document.getElementById('modal').classList.contains('show')).toBe(false)
  })

  it('восстанавливает скролл body', () => {
    modal.close()
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('Modal — события', () => {
  it('клик по кнопке закрытия закрывает модальное окно', () => {
    modal.open('t', '')
    document.querySelector('.close-btn').click()
    expect(document.getElementById('modal').classList.contains('show')).toBe(false)
  })

  it('клик по фону (backdrop) закрывает модальное окно', () => {
    modal.open('t', '')
    const event = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(event, 'target', { value: document.getElementById('modal') })
    document.getElementById('modal').dispatchEvent(event)
    expect(document.getElementById('modal').classList.contains('show')).toBe(false)
  })

  it('клик по содержимому не закрывает модальное окно', () => {
    modal.open('t', '<div id="inner">content</div>')
    // Клик по элементу внутри, target !== modal
    const inner = document.getElementById('inner')
    const event = new MouseEvent('click', { bubbles: false })
    Object.defineProperty(event, 'target', { value: inner })
    document.getElementById('modal').dispatchEvent(event)
    expect(document.getElementById('modal').classList.contains('show')).toBe(true)
  })
})
