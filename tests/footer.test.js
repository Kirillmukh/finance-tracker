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
  nav.getBoundingClientRect = () => ({ left: 0, right: 300, width: 300, top: 0, bottom: 0, height: 0 })
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
    expect(indicator.style.transform).toBe('translateX(0%) scale(1, 1)')
  })

  it('клик по вкладке передвигает индикатор (active ставит Navigation)', () => {
    setupFooter(navigation)
    const exportItem = document.querySelector('[data-page="export"]')
    // имитируем работу обработчика Navigation, который сработал бы раньше
    document.querySelector('[data-page="home"]').classList.remove('active')
    exportItem.classList.add('active')
    exportItem.dispatchEvent(new Event('click', { bubbles: true }))
    expect(nav.querySelector('.nav-indicator').style.transform).toBe('translateX(100%) scale(1, 1)')
  })
})

describe('setupFooter — свайп по панели', () => {
  it('пилюля подъезжает под палец уже на pointerdown, при движении следит без анимации', () => {
    setupFooter(navigation)
    const indicator = nav.querySelector('.nav-indicator')
    pointer(nav, 'pointerdown', 200)
    // касание на x=200 → слот-смещение 200/100 − 0.5 = 1.5, анимированно
    expect(indicator.style.transform).toContain('translateX(150%)')
    expect(indicator.classList.contains('nav-indicator--drag')).toBe(false)
    pointer(nav, 'pointermove', 150)
    expect(indicator.style.transform).toContain('translateX(100%)')
    expect(indicator.classList.contains('nav-indicator--drag')).toBe(true)
  })

  it('тап: окно открывается сразу на pointerdown, без клика по ссылке', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 150)
    expect(navigation.showPage).toHaveBeenCalledWith('export')
    pointer(nav, 'pointerup', 150)
    expect(navigation.showPage).toHaveBeenCalledTimes(1)
    expect(nav.querySelector('.nav-indicator').style.transform).toBe('translateX(100%) scale(1, 1)')
  })

  it('пузырь: при движении пилюля растягивается по X и сплющивается по Y', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 200)
    pointer(nav, 'pointermove', 150)
    const transform = nav.querySelector('.nav-indicator').style.transform
    const [, sx, sy] = transform.match(/scale\(([\d.]+), ([\d.]+)\)/)
    expect(Number(sx)).toBeGreaterThan(1)
    expect(Number(sx)).toBeLessThanOrEqual(1.25)
    expect(Number(sx) * Number(sy)).toBeCloseTo(1, 5)
  })

  it('пузырь: после отпускания масштаб возвращается к 1', () => {
    setupFooter(navigation)
    swipe(nav, 200, 150)
    expect(nav.querySelector('.nav-indicator').style.transform).toContain('scale(1, 1)')
  })

  it('во время драга подсвечена вкладка под пилюлей, остальные нет', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 50)
    pointer(nav, 'pointermove', 250)
    expect(nav.classList.contains('dragging')).toBe(true)
    expect(document.querySelector('[data-page="input"]').classList.contains('in-bubble')).toBe(true)
    expect(document.querySelector('[data-page="home"]').classList.contains('in-bubble')).toBe(false)
    expect(document.querySelector('[data-page="export"]').classList.contains('in-bubble')).toBe(false)
  })

  it('после отпускания классы dragging и in-bubble снимаются', () => {
    setupFooter(navigation)
    swipe(nav, 50, 250)
    expect(nav.classList.contains('dragging')).toBe(false)
    expect(document.querySelectorAll('.in-bubble').length).toBe(0)
  })

  it('окно переключается живьём во время драга, до отпускания', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 50)
    pointer(nav, 'pointermove', 250)
    // палец ещё не отпущен, но окно под пилюлей уже открыто
    expect(navigation.showPage).toHaveBeenCalledWith('input')
  })

  it('отпускание открывает вкладку под пилюлей, даже при быстром жесте', () => {
    setupFooter(navigation)
    // резкий (<300мс) перенос пальца с home на дальнюю вкладку
    swipe(nav, 50, 250)
    expect(navigation.showPage).toHaveBeenCalledWith('input')
  })

  it('резкий свайп влево с последней вкладки открывает вкладку под пилюлей (баг-регресс)', () => {
    document.querySelector('[data-page="home"]').classList.remove('active')
    document.querySelector('[data-page="input"]').classList.add('active')
    setupFooter(navigation)
    swipe(nav, 250, 60)
    expect(navigation.showPage).toHaveBeenCalledWith('home')
  })

  it('короткий флик, не дотянувший до соседа, толкает на вкладку в направлении пальца', () => {
    setupFooter(navigation)
    // палец остался над home (round = 0), но сдвиг 35px ≥ 0.3 слота вправо
    swipe(nav, 10, 45)
    expect(navigation.showPage).toHaveBeenCalledWith('export')
  })

  it('короткий флик влево со средней вкладки толкает на вкладку слева', () => {
    document.querySelector('[data-page="home"]').classList.remove('active')
    document.querySelector('[data-page="export"]').classList.add('active')
    setupFooter(navigation)
    // палец остался над export (round(0.85) = 1), сдвиг 35px влево
    swipe(nav, 170, 135)
    expect(navigation.showPage).toHaveBeenCalledWith('home')
  })

  it('совсем короткий флик (меньше порога) не переключает и возвращает индикатор', () => {
    setupFooter(navigation)
    swipe(nav, 60, 40)
    expect(navigation.showPage).not.toHaveBeenCalled()
    const indicator = nav.querySelector('.nav-indicator')
    expect(indicator.style.transform).toBe('translateX(0%) scale(1, 1)')
    expect(indicator.classList.contains('nav-indicator--drag')).toBe(false)
  })

  it('флик влево на первой вкладке не переключает (clamp)', () => {
    setupFooter(navigation)
    swipe(nav, 45, 10)
    expect(navigation.showPage).not.toHaveBeenCalled()
  })

  it('удержание и перенос пальца на иконку выбирает вкладку под пальцем', () => {
    vi.useFakeTimers()
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 50)
    pointer(nav, 'pointermove', 250)
    vi.advanceTimersByTime(400)
    pointer(nav, 'pointerup', 250)
    expect(navigation.showPage).toHaveBeenCalledWith('input')
    vi.useRealTimers()
  })

  it('удержание с возвратом пальца на активную вкладку возвращает исходное окно', () => {
    vi.useFakeTimers()
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 50)
    pointer(nav, 'pointermove', 150) // живьём открылся export
    vi.advanceTimersByTime(400)
    pointer(nav, 'pointermove', 60) // палец вернулся → живьём вернулся home
    pointer(nav, 'pointerup', 60)
    expect(navigation.showPage).toHaveBeenLastCalledWith('home')
    expect(document.querySelector('[data-page="home"]').classList.contains('active')).toBe(true)
    expect(nav.querySelector('.nav-indicator').style.transform).toBe('translateX(0%) scale(1, 1)')
    vi.useRealTimers()
  })

  it('указательный клик по ссылке (detail > 0) всегда гасится', () => {
    setupFooter(navigation)
    const clickSpy = vi.fn()
    const inputItem = document.querySelector('[data-page="input"]')
    inputItem.addEventListener('click', clickSpy)
    inputItem.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }))
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('клавиатурная активация (click с detail 0) проходит к обработчикам', () => {
    setupFooter(navigation)
    const clickSpy = vi.fn()
    const inputItem = document.querySelector('[data-page="input"]')
    inputItem.addEventListener('click', clickSpy)
    inputItem.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true, cancelable: true }))
    expect(clickSpy).toHaveBeenCalled()
  })

  it('pointercancel прибирается без коммита', () => {
    setupFooter(navigation)
    pointer(nav, 'pointerdown', 50)
    pointer(nav, 'pointermove', 250) // живьём открылся input
    pointer(nav, 'pointercancel', 250)
    expect(nav.classList.contains('dragging')).toBe(false)
    expect(document.querySelectorAll('.in-bubble').length).toBe(0)
    // пилюля встала на актуальную (живьём переключённую) вкладку
    expect(nav.querySelector('.nav-indicator').style.transform).toBe('translateX(200%) scale(1, 1)')
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
