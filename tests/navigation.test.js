import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../js/storage.js', () => ({
  Storage: {
    setPage: vi.fn(),
    getPage: vi.fn(() => 'home'),
  },
}))

import { Navigation } from '../js/navigation.js'
import { Storage } from '../js/storage.js'

function setupDOM() {
  document.body.innerHTML = `
    <div class="page" id="home-page" style="display: none"></div>
    <div class="page" id="input-page" style="display: none"></div>
    <div class="page" id="export-page" style="display: none"></div>
    <nav>
      <a class="nav-item active" data-page="home">Главная</a>
      <a class="nav-item" data-page="input">Добавить</a>
      <a class="nav-item" data-page="export">Экспорт</a>
    </nav>
  `
}

let nav

beforeEach(() => {
  setupDOM()
  vi.clearAllMocks()
  Storage.getPage.mockReturnValue('home')
  nav = new Navigation()
})

describe('Navigation.showPage', () => {
  it('показывает нужную страницу', () => {
    nav.showPage('input')
    expect(document.getElementById('input-page').style.display).toBe('block')
  })

  it('скрывает все остальные страницы', () => {
    nav.showPage('input')
    expect(document.getElementById('home-page').style.display).toBe('none')
    expect(document.getElementById('export-page').style.display).toBe('none')
  })

  it('добавляет класс active нужному nav-item', () => {
    nav.showPage('input')
    const activeItem = document.querySelector('.nav-item[data-page="input"]')
    expect(activeItem.classList.contains('active')).toBe(true)
  })

  it('убирает класс active у остальных nav-item', () => {
    nav.showPage('input')
    const homeItem = document.querySelector('.nav-item[data-page="home"]')
    expect(homeItem.classList.contains('active')).toBe(false)
  })

  it('сохраняет страницу в Storage', () => {
    nav.showPage('export')
    expect(Storage.setPage).toHaveBeenCalledWith('export')
  })
})

describe('Navigation.init', () => {
  it('показывает страницу из Storage', () => {
    Storage.getPage.mockReturnValue('export')
    nav.init()
    expect(document.getElementById('export-page').style.display).toBe('block')
  })
})

describe('Navigation — события клика', () => {
  it('клик по nav-item переключает страницу', () => {
    const inputItem = document.querySelector('.nav-item[data-page="input"]')
    inputItem.click()
    expect(document.getElementById('input-page').style.display).toBe('block')
  })
})
