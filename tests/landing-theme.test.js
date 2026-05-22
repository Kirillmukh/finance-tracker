import { describe, it, expect, beforeEach, vi } from 'vitest'

let lsStore = {}
const localStorageMock = {
  getItem: (k) => lsStore[k] ?? null,
  setItem: (k, v) => { lsStore[k] = String(v) },
  removeItem: (k) => { delete lsStore[k] },
  clear: () => { lsStore = {} },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  lsStore = {}
  document.documentElement.removeAttribute('data-theme')
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

// Inline logic replicated from landing.html for unit testing

function runPreApply() {
  try {
    const t = localStorage.getItem('theme')
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t)
  } catch (_) {}
}

function getEffective() {
  try {
    const t = localStorage.getItem('theme')
    if (t === 'dark') return 'dark'
    if (t === 'light') return 'light'
  } catch (_) {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  if (theme === 'dark' || theme === 'light') {
    document.documentElement.setAttribute('data-theme', theme)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  try { localStorage.setItem('theme', theme) } catch (_) {}
}

function setupBtn() {
  document.body.innerHTML = '<button id="theme-toggle"></button>'
}

function updateBtn() {
  const moonIcon = '<svg data-icon="moon"></svg>'
  const sunIcon = '<svg data-icon="sun"></svg>'
  const btn = document.getElementById('theme-toggle')
  if (!btn) return
  if (getEffective() === 'dark') {
    btn.innerHTML = sunIcon
    btn.setAttribute('aria-label', 'Светлая тема')
  } else {
    btn.innerHTML = moonIcon
    btn.setAttribute('aria-label', 'Тёмная тема')
  }
}

// --- Pre-application script (<head> before styles) ---

describe('landing — предварительное применение темы', () => {
  it('устанавливает data-theme="dark" при сохранённой тёмной теме', () => {
    lsStore.theme = 'dark'
    runPreApply()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('устанавливает data-theme="light" при сохранённой светлой теме', () => {
    lsStore.theme = 'light'
    runPreApply()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('не устанавливает data-theme при значении "system"', () => {
    lsStore.theme = 'system'
    runPreApply()
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('не устанавливает data-theme при отсутствии сохранённой темы', () => {
    runPreApply()
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })
})

// --- getEffective ---

describe('landing — getEffective', () => {
  it('возвращает "dark" при localStorage.theme = "dark"', () => {
    lsStore.theme = 'dark'
    expect(getEffective()).toBe('dark')
  })

  it('возвращает "light" при localStorage.theme = "light"', () => {
    lsStore.theme = 'light'
    expect(getEffective()).toBe('light')
  })

  it('использует системную тёмную тему при отсутствии сохранённой', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(getEffective()).toBe('dark')
  })

  it('использует системную светлую тему при отсутствии сохранённой', () => {
    expect(getEffective()).toBe('light')
  })

  it('игнорирует неизвестное значение и падает на matchMedia', () => {
    lsStore.theme = 'system'
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(getEffective()).toBe('dark')
  })
})

// --- applyTheme ---

describe('landing — applyTheme', () => {
  it('устанавливает data-theme="dark"', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('устанавливает data-theme="light"', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('удаляет data-theme для значения "system"', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    applyTheme('system')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('сохраняет тему в localStorage', () => {
    applyTheme('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('перезаписывает предыдущую тему в localStorage', () => {
    applyTheme('dark')
    applyTheme('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('синхронизирует тему с приложением через тот же ключ localStorage.theme', () => {
    applyTheme('dark')
    const appReads = localStorage.getItem('theme')
    expect(appReads).toBe('dark')
  })
})

// --- Кнопка переключения ---

describe('landing — updateBtn', () => {
  beforeEach(setupBtn)

  it('при тёмной теме кнопка содержит иконку солнца и aria-label "Светлая тема"', () => {
    lsStore.theme = 'dark'
    updateBtn()
    const btn = document.getElementById('theme-toggle')
    expect(btn.getAttribute('aria-label')).toBe('Светлая тема')
    expect(btn.querySelector('[data-icon="sun"]')).not.toBeNull()
  })

  it('при светлой теме кнопка содержит иконку луны и aria-label "Тёмная тема"', () => {
    lsStore.theme = 'light'
    updateBtn()
    const btn = document.getElementById('theme-toggle')
    expect(btn.getAttribute('aria-label')).toBe('Тёмная тема')
    expect(btn.querySelector('[data-icon="moon"]')).not.toBeNull()
  })
})

describe('landing — клик по кнопке переключения', () => {
  beforeEach(setupBtn)

  it('переключает тёмную тему на светлую', () => {
    lsStore.theme = 'dark'
    applyTheme(getEffective() === 'dark' ? 'light' : 'dark')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('переключает светлую тему на тёмную', () => {
    lsStore.theme = 'light'
    applyTheme(getEffective() === 'dark' ? 'light' : 'dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('переключает системную тёмную тему на светлую без matchMedia', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    applyTheme(getEffective() === 'dark' ? 'light' : 'dark')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('переключает системную светлую тему на тёмную', () => {
    applyTheme(getEffective() === 'dark' ? 'light' : 'dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
