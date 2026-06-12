import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { setupFooter } from '../js/footer.js'

// Порядок вкладок как в index.html: home, export, input
function setupDOM() {
  document.body.innerHTML = `
    <nav class="bottom-nav">
      <a href="#" class="nav-item active" data-page="home">
        <span class="icon">🏠</span><span class="label">Главная</span>
      </a>
      <a href="#" class="nav-item" data-page="export">
        <span class="icon">⚙</span><span class="label">Настройки</span>
      </a>
      <a href="#" class="nav-item" data-page="input">
        <span class="icon">+</span><span class="label">Добавить</span>
      </a>
    </nav>
  `
}

// Event не имеет clientX — присваиваем как обычное свойство, обработчики его читают
function pointer(target, type, clientX) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  e.clientX = clientX
  target.dispatchEvent(e)
}

function swipe(nav, fromX, toX) {
  pointer(nav, 'pointerdown', fromX)
  pointer(nav, 'pointermove', toX)
  pointer(nav, 'pointerup', toX)
}

const setScrollY = (y) =>
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })

let nav
let navigation

beforeEach(() => {
  setupDOM()
  nav = document.querySelector('.bottom-nav')
  // jsdom не делает layout — задаём ширину панели: 3 слота по 100px
  Object.defineProperty(nav, 'clientWidth', { value: 300, configurable: true })
  // Мок Navigation повторяет реальное поведение showPage с классом active
  navigation = {
    showPage: vi.fn((pageId) => {
      document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.getAttribute('data-page') === pageId)
      })
    }),
  }
  setScrollY(0)
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0 })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('setupFooter — инициализация', () => {
  it('возвращает null, если .bottom-nav нет в DOM', () => {
    document.body.innerHTML = ''
    expect(setupFooter(navigation)).toBeNull()
  })

  it('вставляет индикатор и ставит его на активную вкладку', () => {
    setupFooter(navigation)
    const indicator = nav.querySelector('.nav-indicator')
    expect(indicator).not.toBeNull()
    expect(indicator.style.transform).toBe('translateX(0%)')
  })

  it('клик по вкладке передвигает индикатор (active ставит Navigation)', () => {
    setupFooter(navigation)
    const exportItem = document.querySelector('[data-page="export"]')
    // имитируем работу обработчика Navigation, который сработал бы раньше
    document.querySelector('[data-page="home"]').classList.remove('active')
    exportItem.classList.add('active')
    exportItem.dispatchEvent(new Event('click', { bubbles: true }))
    expect(nav.querySelector('.nav-indicator').style.transform).toBe('translateX(100%)')
  })
})

describe('setupFooter — свайп по панели', () => {
  it('индикатор следует за пальцем без анимации', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 200)
    pointer(nav, 'pointermove', 150)
    const indicator = nav.querySelector('.nav-indicator')
    expect(indicator.classList.contains('nav-indicator--drag')).toBe(true)
    expect(indicator.style.transform).toBe('translateX(50%)')
  })

  it('свайп влево переключает на следующую вкладку', () => {
    setupFooter(navigation)
    swipe(nav, 200, 150)
    expect(navigation.showPage).toHaveBeenCalledWith('export')
  })

  it('короткий свайп (меньше порога) не переключает и возвращает индикатор', () => {
    setupFooter(navigation)
    swipe(nav, 200, 180)
    expect(navigation.showPage).not.toHaveBeenCalled()
    const indicator = nav.querySelector('.nav-indicator')
    expect(indicator.style.transform).toBe('translateX(0%)')
    expect(indicator.classList.contains('nav-indicator--drag')).toBe(false)
  })

  it('свайп вправо на первой вкладке не переключает (clamp)', () => {
    setupFooter(navigation)
    swipe(nav, 100, 160)
    expect(navigation.showPage).not.toHaveBeenCalled()
  })

  it('длинный свайп перескакивает через вкладку', () => {
    setupFooter(navigation)
    swipe(nav, 300, 50)
    expect(navigation.showPage).toHaveBeenCalledWith('input')
  })

  it('свайп вправо со средней вкладки переключает назад', () => {
    document.querySelector('[data-page="home"]').classList.remove('active')
    document.querySelector('[data-page="export"]').classList.add('active')
    setupFooter(navigation)
    swipe(nav, 100, 160)
    expect(navigation.showPage).toHaveBeenCalledWith('home')
  })

  it('после свайпа клик по вкладке гасится', () => {
    setupFooter(navigation)
    swipe(nav, 200, 150)
    const clickSpy = vi.fn()
    const inputItem = document.querySelector('[data-page="input"]')
    inputItem.addEventListener('click', clickSpy)
    inputItem.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('обычный клик (без свайпа) не гасится', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 200)
    pointer(nav, 'pointerup', 202)
    const clickSpy = vi.fn()
    const inputItem = document.querySelector('[data-page="input"]')
    inputItem.addEventListener('click', clickSpy)
    inputItem.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
    expect(clickSpy).toHaveBeenCalled()
  })
})

describe('setupFooter — компактный режим при скролле', () => {
  it('скролл вниз добавляет .compact', () => {
    setupFooter(navigation)
    setScrollY(100)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.classList.contains('compact')).toBe(true)
  })

  it('скролл вверх убирает .compact', () => {
    setupFooter(navigation)
    setScrollY(200)
    window.dispatchEvent(new Event('scroll'))
    setScrollY(180)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.classList.contains('compact')).toBe(false)
  })

  it('мелкое дрожание скролла (меньше дельты) не меняет состояние', () => {
    setupFooter(navigation)
    setScrollY(200)
    window.dispatchEvent(new Event('scroll'))
    setScrollY(195)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.classList.contains('compact')).toBe(true)
  })

  it('возле верха страницы панель всегда развёрнута', () => {
    setupFooter(navigation)
    setScrollY(200)
    window.dispatchEvent(new Event('scroll'))
    setScrollY(30)
    window.dispatchEvent(new Event('scroll'))
    expect(nav.classList.contains('compact')).toBe(false)
  })

  it('касание панели разворачивает её', () => {
    setupFooter(navigation)
    setScrollY(200)
    window.dispatchEvent(new Event('scroll'))
    pointer(nav, 'pointerdown', 150)
    expect(nav.classList.contains('compact')).toBe(false)
  })
})
